import type { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from "homebridge";
import ssdp, { SSDP, Service as SsdpService } from "@achingbrain/ssdp";

import { DenonAudioAccessory as DenonAudioAccessory } from "./platformAccessory.js";
import * as CustomLogging from "./customLogging.js";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";
import * as DenonProtocol from "./denonProtocol.js";
import type { DeviceConfig } from "./config.js";
import { buildDiscoveredDeviceConfig } from "./discovery.js";

const SUPPORTED_BRANDS = ["denon", "marantz"];

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
          this.createAccessoryHandler(existingAccessory, deviceConfig);

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
      this.discoverSsdpDevices().catch((error) => {
        this.log.warn("Device discovery stopped unexpectedly. New devices will no longer be discovered.");
        this.log.debug("Error that caused the warning above:", error);
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
  private publishNewAccessory(deviceConfig: DeviceConfig, accessory: PlatformAccessory) {
    // store a copy of the device object in the `accessory.context`
    accessory.context.device = deviceConfig;
    if (this.createAccessoryHandler(accessory, deviceConfig)) {
      this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
    }
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
    this.publishNewAccessory(deviceConfig, new this.api.platformAccessory(deviceConfig.name, this.api.hap.uuid.generate(serialNumber)));
  }

  /**
   * Creates the accessory handler. Configuration errors are logged instead of being thrown,
   * so that a single misconfigured device does not prevent the other devices (or Homebridge) from starting.
   * @returns true if the accessory was set up successfully
   */
  private createAccessoryHandler(accessory: PlatformAccessory, deviceConfig: DeviceConfig): boolean {
    try {
      new DenonAudioAccessory(this, accessory, deviceConfig, this.rawLog);
      return true;
    } catch (error) {
      this.log.error(`Could not set up device '${deviceConfig.name}':`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  async discoverSsdpDevices() {
    let bus: SSDP | undefined;
    let stopped = false;
    const stop = (error: unknown) => {
      if (stopped) {
        return;
      }
      stopped = true;
      this.log.warn("Error in the device discovery service. Shutting it down. New devices will no longer be discovered.");
      this.log.debug("Error that caused the warning above:", error);
      bus?.stop().catch(() => {});
    };

    try {
      bus = await ssdp();
      bus.on("error", stop);

      for await (const service of bus.discover()) {
        if (stopped) {
          break;
        }
        await this.checkSsdpDevice(service);
      }
    } catch (error) {
      stop(error);
    }
  }

  async checkSsdpDevice(service: SsdpService) {
    const device = service.details?.device;
    const serial: string | undefined = device?.serialNumber;
    if (!serial || this.ssdpSeenSerialNumbers.has(serial)) {
      return;
    }
    this.ssdpSeenSerialNumbers.add(serial);

    // HEOS devices are made by Denon and Marantz (Sound United / Masimo); both use the same control protocols.
    const identification = [device.manufacturer, device.manufacturerURL, device.modelName, device.friendlyName].join(" ").toLowerCase();
    if (!SUPPORTED_BRANDS.some((brand) => identification.includes(brand))) {
      return;
    }

    if (!service.location?.href) {
      return;
    }

    try {
      const response = await fetch(service.location.href, { signal: AbortSignal.timeout(5000) });
      response.body?.cancel().catch(() => {});
      if (!response.ok) {
        this.log.debug(`Received a non-200 status code while connecting to a new device's location href (status code: ${response.status}).`);
        return;
      }
    } catch (error) {
      this.log.debug("An error occured while connecting to a new device's location href.", error);
      // try again with the next announcement of this device
      this.ssdpSeenSerialNumbers.delete(serial);
      return;
    }

    this.log.debug("Checking protocol support for:", service.location.hostname);
    const supportedModes = await DenonProtocol.checkProtocolSupport(service.location.hostname, this.log.debug.bind(this.log));
    if (supportedModes.length === 0) {
      return;
    }

    this.log.success("-------------------------------------------------------");
    this.log.success("Found Denon / Marantz device in local network:");
    this.log.success("Friendly name:", device.friendlyName);
    this.log.success("Model name:   ", device.modelName);
    this.log.success("Serial number:", serial);
    this.log.success("IP address:   ", service.location.hostname);
    this.log.success("Supported modes:", supportedModes.map((mode) => DenonProtocol.ControlMode[mode]).join(", "));
    this.log.success("-------------------------------------------------------");

    if (this.autoAddEnabled()) {
      this.autoAddDiscoveredDevice(serial, service.location.hostname, device.friendlyName, device.modelName, supportedModes);
    }
  }
}
