import type { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from "homebridge";
import ssdp, { SSDP } from "@achingbrain/ssdp";

import { DenonAudioAccessory as DenonAudioAccessory } from "./platformAccessory.js";
import * as CustomLogging from "./customLogging.js";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";
import * as DenonProtocol from "./denonProtocol.js";

export class DenonAudioPlatform implements DynamicPlatformPlugin {
  public readonly rawLog: Logger;
  public readonly log: Logger;
  public readonly config: PlatformConfig;
  public readonly api: API;

  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly ssdpDiscoveredDevices = new Map<string, any>();

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
    if (this.config.deviceDiscovery) {
      this.discoverSsdpDevices().catch((error) => {
        this.log.warn("Device discovery stopped unexpectedly. New devices will no longer be discovered.");
        this.log.debug("Error that caused the warning above:", error);
      });
    }

    let existingAccessoriesUuids = Array.from(this.accessories.keys());

    // loop over the configured devices and register each one if it has not already been registered
    if (this.config.devices) {
      for (const deviceConfig of this.config.devices) {
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
          new DenonAudioAccessory(this, existingAccessory, deviceConfig, this.rawLog);

          // after it has been restored, the existing accessory should be removed form the uuid list
          existingAccessoriesUuids = existingAccessoriesUuids.filter((uuid) => uuid !== existingAccessory.UUID);
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info("Adding new accessory:", deviceConfig.name);

          // create a new accessory
          const accessory = new this.api.platformAccessory(deviceConfig.name, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = deviceConfig;

          // create the accessory handler for the newly create accessory
          new DenonAudioAccessory(this, accessory, deviceConfig, this.rawLog);

          // publish as external accessory since HomeKit only allows one television accessory per bridge
          this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
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
  }

  async discoverSsdpDevices() {
    let bus: SSDP | undefined = undefined;
    let discoverIterator = undefined;
    let errorOccurred = false;

    try {
      bus = await ssdp();

      bus.on("error", (error) => {
        if (!errorOccurred) {
          this.log.warn("Error in the device discovery service. Shutting it down. New devices will no longer be discovered.");
          this.log.debug("Error that caused the warning above:", error);
          errorOccurred = true;
          bus?.stop().catch(() => {});
        }
      });

      discoverIterator = bus?.discover();
    } catch (error) {
      this.log.warn("Error in the device discovery service. Shutting it down. New devices will no longer be discovered.");
      this.log.debug("Error that caused the warning above:", error);
      errorOccurred = true;
      bus?.stop().catch(() => {});
    }

    // Loop until an error occurs or the iterator is done
    while (!errorOccurred) {
      let service;
      try {
        const { value: serviceFound, done } = await discoverIterator!.next();
        if (done) break; // End of discovery
        if (errorOccurred) break;
        service = serviceFound;
      } catch (error) {
        // Catch errors from the async iterator
        if (!errorOccurred) {
          this.log.warn("Error in the device discovery service. Shutting it down. New devices will no longer be discovered.");
          this.log.debug("Error that caused the warning above:", error);
          errorOccurred = true;
          bus?.stop().catch(() => {});
        }
      }
      await this.checkSsdpDevice(service);
    }
  }

  async checkSsdpDevice(service: any) {
    const serial = service?.details?.device?.serialNumber;

    if (!serial) {
      return;
    }

    if (this.ssdpDiscoveredDevices.has(serial)) {
      return;
    }

    this.ssdpDiscoveredDevices.set(serial, service);

    if (!JSON.stringify(service).toLowerCase().includes("denon")) {
      return;
    }

    if (!service.location.href) {
      return;
    }

    try {
      const response = await fetch(service.location.href);
      response.body?.cancel();
      if (!response.ok) {
        this.log.debug(`Received a non-200 status code while connecting to a new device's location href (status code: ${response.status}).`);
        return;
      }
    } catch (error) {
      this.log.debug("An error occured while connecting to a new device's location href.", error);
      return;
    }

    this.log.debug("Checking protocol support for:", service.location.hostname);
    const supportedModes = await DenonProtocol.checkProtocolSupport(service.location.hostname, this.log.debug.bind(this.log));
    if (supportedModes.length === 0) {
      return;
    }

    this.log.success("-------------------------------------------------------");
    this.log.success("Found DENON device in local network:");
    this.log.success("Friendly name:", service.details?.device?.friendlyName);
    this.log.success("Model name:   ", service.details?.device?.modelName);
    this.log.success("Serial number:", serial);
    this.log.success("IP address:   ", service.location.hostname);
    this.log.success("Supported modes:", supportedModes.map((mode) => DenonProtocol.ControlMode[mode]).join(", "));
    this.log.success("-------------------------------------------------------");
  }
}
