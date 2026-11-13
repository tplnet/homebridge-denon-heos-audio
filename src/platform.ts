import type { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from "homebridge";

import { DenonAudioAccessory as DenonAudioAccessory } from "./platformAccessory.js";
import * as CustomLogging from "./customLogging.js";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";
import * as DenonProtocol from "./denonProtocol.js";
import type { DeviceConfig } from "./config.js";
import { buildDiscoveredDeviceConfig } from "./discovery.js";
import { checkControlProtocol } from "./protocolCheck.js";
import { DiscoveredHeosDevice, HeosDiscovery } from "./heosDiscovery.js";

const MINUTE = 60 * 1000;

export class DenonAudioPlatform implements DynamicPlatformPlugin {
  public readonly rawLog: Logger;
  public readonly log: Logger;
  public readonly config: PlatformConfig;
  public readonly api: API;

  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  private readonly ssdpSeenSerialNumbers = new Set<string>();
  // serial numbers of devices set up from the manual configuration or by auto-add
  private readonly activeSerialNumbers = new Set<string>();

  // device discovery
  private discoveryFactory: () => HeosDiscovery = () => new HeosDiscovery({ debugLog: this.log.debug.bind(this.log) });
  private activeDiscovery: HeosDiscovery | undefined;
  private discoveryRestartDelaysMs = [1 * MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE];
  private discoveryRestartTimer: NodeJS.Timeout | undefined;
  // ends the current discovery session or restart delay immediately (used on shutdown)
  private interruptDiscovery: (() => void) | undefined;
  private shuttingDown = false;

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.rawLog = config.consoleLogEnabled ? new CustomLogging.ConsoleLogger(CustomLogging.logLevelFromString[config.consoleLogLevel], PLUGIN_NAME, true) : log;
    this.log = new CustomLogging.LoggerPrefixWrapper(this.rawLog, "Platform");
    this.config = config;
    this.api = api;

    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug("Finished initializing platform:", this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired, in order to ensure they weren't added to homebridge already.
    // This event can also be used to start discovery of new accessories.
    this.api.on("didFinishLaunching", () => {
      log.debug("Executed didFinishLaunching callback");
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });

    this.api.on("shutdown", () => {
      this.shuttingDown = true;
      clearTimeout(this.discoveryRestartTimer);
      this.activeDiscovery?.stop();
      this.interruptDiscovery?.();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  discoverDevices() {
    let existingAccessoriesUuids = Array.from(this.accessories.keys());

    // loop over the configured devices and register each one if it has not already been registered
    if (this.config.devices) {
      for (const deviceConfig of this.config.devices as DeviceConfig[]) {
        if (this.activeSerialNumbers.has(deviceConfig.serialNumber)) {
          this.log.warn(`Device with serial number ${deviceConfig.serialNumber} is configured more than once. Skipping '${deviceConfig.name}'.`);
          continue;
        }
        this.activeSerialNumbers.add(deviceConfig.serialNumber);

        // generate a unique id for the accessory this should be generated from something globally unique, but constant, for example, the device serial number
        // or MAC address
        const uuid = this.api.hap.uuid.generate(deviceConfig.serialNumber);

        // see if an accessory with the same uuid has already been registered and restored from the cached devices we stored in the `configureAccessory` method
        // above
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info("Restoring existing accessory from cache:", existingAccessory.displayName);

          // create the accessory handler for the restored accessory
          this.withCheckedProtocol(deviceConfig)
            .then((checkedConfig) => this.createAccessoryHandler(existingAccessory, checkedConfig)?.setupInputs())
            .catch((error) => this.log.error(`Could not set up '${deviceConfig.name}':`, error));

          // after it has been restored, the existing accessory should be removed form the uuid list
          existingAccessoriesUuids = existingAccessoriesUuids.filter((uuid) => uuid !== existingAccessory.UUID);
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info("Adding new accessory:", deviceConfig.name);

          const accessory = new this.api.platformAccessory(deviceConfig.name, uuid);
          this.publishNewAccessory(deviceConfig, accessory);
        }
      }
    }

    // remove platform accessories from cache when no longer present
    for (const uuid of existingAccessoriesUuids) {
      const existingAccessory = this.accessories.get(uuid);
      if (existingAccessory) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info("Removing existing accessory from cache:", existingAccessory.displayName);
      }
    }

    if (this.config.deviceDiscovery || this.autoAddEnabled()) {
      this.runDeviceDiscovery().catch((error) => {
        this.log.warn("Device discovery stopped unexpectedly. New devices will no longer be discovered.", error);
      });
    }
  }

  private autoAddEnabled(): boolean {
    return this.config.autoAddDiscoveredDevices === true;
  }

  private isExcluded(serialNumber: string): boolean {
    const excluded: unknown = this.config.excludedSerialNumbers;
    return Array.isArray(excluded) && excluded.some((entry) => String(entry).trim().toUpperCase() === serialNumber.toUpperCase());
  }

  /**
   * Sets up a new accessory and publishes it as external accessory
   * (HomeKit only allows one television accessory per bridge).
   */
  private publishNewAccessory(deviceConfig: DeviceConfig, accessory: PlatformAccessory, supportedModes?: DenonProtocol.ControlMode[]) {
    // store a copy of the device object in the `accessory.context`
    accessory.context.device = deviceConfig;
    this.withCheckedProtocol(deviceConfig, supportedModes)
      .then(async (checkedConfig) => {
        const handler = this.createAccessoryHandler(accessory, checkedConfig);
        if (!handler) {
          return;
        }
        // the inputs are read from the device first, as the services of a published accessory should not change anymore
        await handler.setupInputs().catch((error) => this.log.error(`Could not set up the inputs of '${deviceConfig.name}':`, error));
        this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
      })
      .catch((error) => this.log.error(`Could not set up '${deviceConfig.name}':`, error));
  }

  /**
   * Checks the configured control protocol against the protocols the device supports and falls back to a supported
   * one if necessary (with a warning). If the device can't be reached, the configuration is used unchanged.
   */
  private async withCheckedProtocol(deviceConfig: DeviceConfig, knownSupportedModes?: DenonProtocol.ControlMode[]): Promise<DeviceConfig> {
    const supportedModes = knownSupportedModes ?? (await DenonProtocol.checkProtocolSupport(deviceConfig.ip, this.log.debug.bind(this.log)));
    const result = checkControlProtocol(deviceConfig.name, deviceConfig.controlProtocol, supportedModes);
    if (result.warning) {
      this.log.warn(result.warning);
    }
    if (result.hint) {
      this.log.info(result.hint);
    }
    if (supportedModes.length === 0) {
      this.log.debug(`Could not check the protocols of '${deviceConfig.name}' (${deviceConfig.ip} not reachable). Using the configuration.`);
    }
    return result.protocol === deviceConfig.controlProtocol ? deviceConfig : { ...deviceConfig, controlProtocol: result.protocol };
  }

  /**
   * Adds a discovered device as new accessory, unless it is configured manually, excluded or already set up.
   */
  private autoAddDiscoveredDevice(serialNumber: string, ip: string, friendlyName: string | undefined, modelName: string | undefined, supportedModes: DenonProtocol.ControlMode[]) {
    if (this.activeSerialNumbers.has(serialNumber)) {
      this.log.info(`Device ${serialNumber} is configured manually. Using the manual configuration.`);
      return;
    }
    if (this.isExcluded(serialNumber)) {
      this.log.info(`Device ${serialNumber} is excluded from automatic adding.`);
      return;
    }

    const deviceConfig = buildDiscoveredDeviceConfig({ serialNumber, ip, friendlyName, modelName, supportedModes });
    if (!deviceConfig) {
      return;
    }

    this.activeSerialNumbers.add(serialNumber);
    this.log.info(`Automatically adding discovered device '${deviceConfig.name}' (${deviceConfig.controlProtocol}, ${ip}).`);
    this.publishNewAccessory(deviceConfig, new this.api.platformAccessory(deviceConfig.name, this.api.hap.uuid.generate(serialNumber)), supportedModes);
  }

  /**
   * Creates the accessory handler. Configuration errors are logged instead of being thrown,
   * so that a single misconfigured device does not prevent the other devices (or Homebridge) from starting.
   * @returns the accessory handler, or undefined if the configuration is invalid
   */
  private createAccessoryHandler(accessory: PlatformAccessory, deviceConfig: DeviceConfig): DenonAudioAccessory | undefined {
    try {
      return new DenonAudioAccessory(this, accessory, deviceConfig, this.rawLog);
    } catch (error) {
      this.log.error(`Could not set up device '${deviceConfig.name}':`, error instanceof Error ? error.message : error);
      return undefined;
    }
  }

  /**
   * Keeps the SSDP device discovery running for the whole lifetime of the plugin.
   * If the discovery service fails (e.g. network interface changes), it is restarted with an increasing delay.
   */
  async runDeviceDiscovery() {
    let failures = 0;
    while (!this.shuttingDown) {
      const startedAt = Date.now();
      const error = await this.discoverSsdpDevices();
      if (this.shuttingDown) {
        return;
      }

      if (Date.now() - startedAt > 30 * MINUTE) {
        failures = 0; // it ran fine for a while, start over with the shortest delay
      }
      const delay = this.discoveryRestartDelaysMs[Math.min(failures, this.discoveryRestartDelaysMs.length - 1)];
      failures++;

      const reason = error instanceof Error ? error.message : error !== undefined ? String(error) : "discovery ended";
      this.log.warn(`Device discovery stopped (${reason}). Restarting in ${Math.max(1, Math.round(delay / MINUTE))} min.`);
      this.log.debug("Error that stopped the device discovery:", error);

      await new Promise<void>((resolve) => {
        this.interruptDiscovery = resolve;
        this.discoveryRestartTimer = setTimeout(resolve, delay);
        this.discoveryRestartTimer.unref?.();
      });
      this.interruptDiscovery = undefined;
    }
  }

  /**
   * Runs one discovery session.
   * @returns a promise that resolves with the socket error that ended the session (undefined if it was interrupted)
   */
  async discoverSsdpDevices(): Promise<unknown> {
    const discovery = this.discoveryFactory();
    this.activeDiscovery = discovery;
    try {
      return await new Promise<unknown>((resolve) => {
        this.interruptDiscovery = () => resolve(undefined);
        discovery.on("error", resolve);
        discovery.on("device", (device: DiscoveredHeosDevice) => {
          this.checkDiscoveredDevice(device).catch((error) => {
            // a single misbehaving device must not stop the discovery
            this.log.debug("Error while checking a discovered device:", error);
          });
        });
        discovery.start().catch(resolve);
      });
    } finally {
      this.interruptDiscovery = undefined;
      this.activeDiscovery = undefined;
      discovery.stop();
    }
  }

  async checkDiscoveredDevice(device: DiscoveredHeosDevice) {
    const serial = device.serialNumber;
    if (this.ssdpSeenSerialNumbers.has(serial)) {
      return;
    }
    this.ssdpSeenSerialNumbers.add(serial);

    this.log.debug("Checking protocol support for:", device.ip);
    const supportedModes = await DenonProtocol.checkProtocolSupport(device.ip, this.log.debug.bind(this.log));
    if (supportedModes.length === 0) {
      return;
    }

    this.log.success("-------------------------------------------------------");
    this.log.success("Found Denon / Marantz device in local network:");
    this.log.success("Friendly name:", device.friendlyName ?? "unknown");
    this.log.success("Model name:   ", device.modelName ?? "unknown");
    this.log.success("Serial number:", serial);
    this.log.success("IP address:   ", device.ip);
    this.log.success("Supported modes:", supportedModes.map((mode) => DenonProtocol.ControlMode[mode]).join(", "));
    this.log.success("-------------------------------------------------------");

    if (this.autoAddEnabled()) {
      this.autoAddDiscoveredDevice(serial, device.ip, device.friendlyName, device.modelName, supportedModes);
    }
  }
}
