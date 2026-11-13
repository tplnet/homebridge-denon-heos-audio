import type { CharacteristicValue, Logger, PlatformAccessory, Service } from "homebridge";

import type { DenonAudioPlatform } from "./platform.js";

import { DOMParser } from "@xmldom/xmldom";
import { PromiseTimeoutException } from "./promiseTimeoutException.js";
import { DefaultInput, IDenonClient, Playing, RaceStatus, ResponseTimeoutException } from "./denonClient.js";
import * as DenonProtocol from "./denonProtocol.js";
import * as CustomLogging from "./customLogging.js";
import type { DeviceConfig, InputConfig } from "./config.js";
import { sanitizeAccessoryName } from "./discovery.js";
import { fromDeviceVolume, toDeviceVolume } from "./volumeLimit.js";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DenonAudioAccessory {
  private static readonly CALLBACK_TIMEOUT = 1500;
  private static readonly API_CONNECT_TIMEOUT = 5 * 1000;
  private static readonly API_RESPONSE_TIMEOUT = 1 * 1000;
  private static readonly DEFAULT_VOLUME_STEP_SIZE = 2;
  private static readonly DEFAULT_POWER_ON_FAVORITE = 1;
  // after switching, devices report the old state for a moment; HomeKit gets the new state during this time
  private static readonly POWER_STATE_SETTLE_TIME = 5 * 1000;
  // includes the time to connect to the device and to look up the player id
  private static readonly INPUT_QUERY_TIMEOUT = 15 * 1000;
  private static readonly DEFAULT_VOLUME_LIMIT = 99;

  private readonly platform: DenonAudioPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly denonClient: IDenonClient;
  private readonly informationService: Service;
  private readonly tvService: Service;
  private readonly speakerService: Service;
  private readonly inputServices: Service[] = [];
  private readonly rawLog: Logger;
  private readonly log: Logger;

  private readonly name: string;
  private readonly ip: string;
  private readonly serialNumber: string;
  private readonly controlMode: DenonProtocol.ControlMode;
  private readonly volumeStepSize: number;
  private readonly volumeLimit: number | undefined;

  private readonly configuredInputs: InputConfig[];
  private configuredInputsByIdentifier: Map<number, ConfiguredInput> = new Map();
  private configuredInputsByInputId: Map<string, ConfiguredInput> = new Map();
  private unknownInput: ConfiguredInput;

  private lastSetVolume: number | undefined;
  private targetMediaState: Playing | undefined;

  private volumeChangeOngoing = false;
  private pendingActive: { value: boolean; until: number } | undefined;
  private powerChangeInProgress = false;
  /** The power change running in the background (for tests). */
  private powerChange: Promise<void> | undefined;
  private playingChangeOngoing = false;

  constructor(platform: DenonAudioPlatform, accessory: PlatformAccessory, config: DeviceConfig, log: Logger) {
    log.debug("Initializing DenonAudioAccessory...");

    this.platform = platform;
    this.accessory = accessory;
    this.rawLog = log;
    this.log = new CustomLogging.LoggerPrefixWrapper(this.rawLog, accessory.displayName);

    this.name = accessory.displayName;
    this.ip = config.ip;
    this.serialNumber = config.serialNumber;
    if (!(config.controlProtocol in DenonProtocol.CONTROL_MODE_BY_NAME)) {
      throw new Error(`Unknown control protocol '${config.controlProtocol}'. Expected one of: ${Object.keys(DenonProtocol.CONTROL_MODE_BY_NAME).join(", ")}`);
    }
    this.controlMode = DenonProtocol.CONTROL_MODE_BY_NAME[config.controlProtocol];

    if (config.volumeLimitEnabled) {
      const volumeLimit = config.volumeLimit ?? DenonAudioAccessory.DEFAULT_VOLUME_LIMIT;
      if (!Number.isInteger(volumeLimit) || volumeLimit < 0 || volumeLimit > 99) {
        throw new Error("Volume limit must be between 0 and 99");
      }
      this.volumeLimit = volumeLimit;
    }

    const volumeStepSize = config.volumeStepSize ?? DenonAudioAccessory.DEFAULT_VOLUME_STEP_SIZE;
    if (!Number.isInteger(volumeStepSize) || volumeStepSize < 1 || volumeStepSize > 10) {
      throw new Error("Volume step size must be between 1 and 10");
    }
    this.volumeStepSize = volumeStepSize;

    // set accessory category
    accessory.category = this.platform.api.hap.Categories.TELEVISION;

    // add information service
    this.informationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    this.informationService.getCharacteristic(this.platform.Characteristic.Identify).onSet(this.setIdentify.bind(this));
    this.informationService.setCharacteristic(this.platform.Characteristic.Name, this.name);
    this.informationService.setCharacteristic(this.platform.Characteristic.SerialNumber, this.serialNumber);
    this.informationService.setCharacteristic(this.platform.Characteristic.Manufacturer, "unknown");
    this.informationService.setCharacteristic(this.platform.Characteristic.Model, "unknown");
    this.informationService.setCharacteristic(this.platform.Characteristic.FirmwareRevision, "unknown");
    void this.fetchMetadataAios();

    // add tv service
    this.tvService = this.accessory.getService(`${this.name} TV`) || this.accessory.addService(this.platform.Service.Television, `${this.name} TV`);
    this.tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.name);
    this.tvService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    this.tvService.getCharacteristic(this.platform.Characteristic.Active).onGet(this.getActive.bind(this)).onSet(this.setActive.bind(this));
    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(this.getActiveIdentifier.bind(this))
      .onSet(this.setActiveIdentifier.bind(this));
    if (this.controlMode !== DenonProtocol.ControlMode.AVRCONTROL) {
      this.tvService.getCharacteristic(this.platform.Characteristic.CurrentMediaState).onGet(this.getCurrentMediaState.bind(this));
      this.tvService
        .getCharacteristic(this.platform.Characteristic.TargetMediaState)
        .onGet(this.getTargetMediaState.bind(this))
        .onSet(this.setTargetMediaState.bind(this));
    }
    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey).onSet(this.setRemoteKey.bind(this));

    // add speaker service
    this.speakerService =
      this.accessory.getService(`${this.name} Speaker`) || this.accessory.addService(this.platform.Service.TelevisionSpeaker, `${this.name} Speaker`);
    this.speakerService.getCharacteristic(this.platform.Characteristic.Mute).onGet(this.getMute.bind(this)).onSet(this.setMute.bind(this));
    this.speakerService.getCharacteristic(this.platform.Characteristic.Volume).onGet(this.getVolume.bind(this)).onSet(this.setVolume.bind(this));
    this.speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector).onSet(this.setVolumeSelector.bind(this));
    this.speakerService.setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);
    this.speakerService.setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
    // Link the speaker to the TV, so the Home app shows it as part of the TV instead of a separate tile.
    if (!this.tvService.linkedServices.includes(this.speakerService)) {
      this.tvService.addLinkedService(this.speakerService);
    }

    // choose appropriate client
    this.denonClient = new DenonProtocol.CLIENT_MAP[this.controlMode](
      this.serialNumber,
      this.name,
      this.ip,
      DenonAudioAccessory.API_CONNECT_TIMEOUT,
      DenonAudioAccessory.API_RESPONSE_TIMEOUT,
      this.log.debug.bind(this.log),
      this.callbackActive.bind(this),
      this.callbackMute.bind(this),
      this.callbackVolume.bind(this),
      this.callbackInput.bind(this),
    );

    const powerOnFavorite = config.powerOnFavorite ?? DenonAudioAccessory.DEFAULT_POWER_ON_FAVORITE;
    if (!Number.isInteger(powerOnFavorite) || powerOnFavorite < 0) {
      throw new Error("Power on favorite must be 0 (disabled) or the number of a HEOS favorite (1, 2, …)");
    }
    this.denonClient.setPowerOnFavorite?.(powerOnFavorite, (message) => this.log.info(message));

    this.configuredInputs = config.inputs ?? [];
    this.unknownInput = new ConfiguredInput("unknown", "Unknown Input", false, 0, false);

    this.log.info("Finished initializing accessory.");
  }

  /**
   * Creates the input services. Must be called (and awaited) before the accessory is published.
   *
   * Order: inputs from the configuration, inputs reported by the device (shown in the input list unless inputs are
   * configured), sources that are only displayed as current input (hidden), and "Unknown Input".
   * If the device can't list its inputs, all known inputs of the protocol are added (hidden) instead.
   */
  async setupInputs() {
    let deviceInputs: DefaultInput[] | undefined;
    try {
      deviceInputs = await this.withTimeout(this.denonClient.getInputSources(), DenonAudioAccessory.INPUT_QUERY_TIMEOUT);
    } catch (error) {
      this.log.info(`Could not read the inputs from the device (${error instanceof Error ? error.message : error}). Using the default input list.`);
    }

    const inputs: ConfiguredInput[] = [];
    const add = (inputID: string, displayName: string, showInList: boolean, userDefined: boolean) => {
      if (inputs.some((input) => input.inputID === inputID)) {
        return;
      }
      inputs.push(new ConfiguredInput(inputID, sanitizeAccessoryName(displayName, inputID), showInList, inputs.length + 1, userDefined));
    };

    for (const input of this.configuredInputs) {
      if (inputs.some((existing) => existing.inputID === input.inputID)) {
        this.log.warn(`Duplicate input ID found in configuration: ${input.inputID}. Skipping this input.`);
        continue;
      }
      add(input.inputID, input.name, input.showInList ?? true, true);
    }

    if (deviceInputs) {
      const showDeviceInputs = this.configuredInputs.length === 0;
      deviceInputs.forEach((input) => add(input.inputID, input.displayName, showDeviceInputs, false));
      this.denonClient.displayOnlyInputs.forEach((input) => add(input.inputID, input.displayName, false, false));
      this.log.info(`Inputs reported by the device: ${deviceInputs.map((input) => `${input.displayName} (${input.inputID})`).join(", ") || "none"}`);
    } else {
      this.denonClient.defaultInputs.forEach((input) => add(input.inputID, input.displayName, false, false));
    }

    this.unknownInput = new ConfiguredInput("unknown", "Unknown Input", false, inputs.length + 1, false);
    inputs.push(this.unknownInput);

    for (const input of inputs) {
      this.configuredInputsByInputId.set(input.inputID, input);
      this.configuredInputsByIdentifier.set(input.identifier, input);

      const inputService =
        this.accessory.getService(`${this.name} Input ${input.inputID}`) ||
        this.accessory.addService(this.platform.Service.InputSource, `${this.name} Input ${input.inputID}`, input.inputID);
      inputService.setCharacteristic(this.platform.Characteristic.Identifier, input.identifier);
      inputService.setCharacteristic(this.platform.Characteristic.ConfiguredName, input.displayName);
      inputService.setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.OTHER);
      inputService.setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED);
      inputService.setCharacteristic(
        this.platform.Characteristic.CurrentVisibilityState,
        input.showInList ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
      );
      this.tvService.addLinkedService(inputService);
      this.inputServices.push(inputService);
    }

    const shown = inputs.filter((input) => input.showInList).map((input) => input.displayName);
    this.log.info(`Added ${inputs.length} input services (shown in the input list: ${shown.join(", ") || "none"}).`);
  }

  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new PromiseTimeoutException(timeout)), timeout);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  private async fetchMetadataAios() {
    try {
      const response = await fetch(`http://${this.ip}:60006/upnp/desc/aios_device/aios_device.xml`, {
        signal: AbortSignal.timeout(DenonAudioAccessory.API_CONNECT_TIMEOUT),
      });
      if (!response.ok) {
        response.body?.cancel().catch(() => {});
        this.log.debug(`Received a non-200 status code while fetching the device description (status code: ${response.status}).`);
        return;
      }

      const text = await response.text();
      const xmlDoc = new DOMParser().parseFromString(text, "text/xml");
      const rootDevice = xmlDoc.getElementsByTagName("device")[0];

      this.informationService.setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        rootDevice?.getElementsByTagName("manufacturer")[0]?.textContent || "unknown",
      );
      this.informationService.setCharacteristic(this.platform.Characteristic.Model, rootDevice?.getElementsByTagName("modelName")[0]?.textContent || "unknown");

      const subDevices = rootDevice?.getElementsByTagName("deviceList")[0]?.getElementsByTagName("device") ?? [];
      for (const d of subDevices) {
        const firmwareVersion = d.getElementsByTagName("firmware_version")[0]?.textContent;
        if (firmwareVersion) {
          this.informationService.setCharacteristic(this.platform.Characteristic.FirmwareRevision, firmwareVersion);
          break;
        }
      }
    } catch (error) {
      this.log.warn(`An error occured while fetching the device description of ${this.name}.`);
      this.log.debug("Error that caused the warning above:", error);
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  async getActive(): Promise<CharacteristicValue> {
    if (this.pendingActive && Date.now() < this.pendingActive.until) {
      this.log.debug(`getActive for ${this.name}. [recently set to ${this.pendingActive.value}]`);
      return this.pendingActive.value;
    }
    this.pendingActive = undefined;
    return this.queryDevice("getActive", "power status", (raceStatus) => this.denonClient.getPower(raceStatus));
  }

  async getActiveIdentifier(): Promise<CharacteristicValue> {
    const currentInput = await this.queryDevice("getActiveIdentifier", "current input", (raceStatus) => this.denonClient.getInput(raceStatus));
    return this.configuredInputsByInputId.get(currentInput)?.identifier ?? this.unknownInput.identifier;
  }

  private getPlaying(): Promise<Playing> {
    return this.queryDevice("getPlaying", "playing status", (raceStatus) => this.denonClient.getPlaying(raceStatus));
  }

  async getCurrentMediaState(): Promise<CharacteristicValue> {
    const playing = await this.getPlaying();
    switch (playing) {
      case Playing.PLAY:
        return this.platform.Characteristic.CurrentMediaState.PLAY;
      case Playing.PAUSE:
        return this.platform.Characteristic.CurrentMediaState.PAUSE;
      case Playing.STOP:
      case Playing.UNSUPPORTED:
        return this.platform.Characteristic.CurrentMediaState.STOP;
    }
  }

  async getTargetMediaState(): Promise<CharacteristicValue> {
    if (this.targetMediaState !== undefined) {
      this.log.debug(`getTargetMediaState for ${this.name}. [retrieving from cache]`);
      return this.playingToTargetMediaState(this.targetMediaState);
    }
    return this.playingToTargetMediaState(await this.getPlaying());
  }

  private playingToTargetMediaState(playing: Playing): CharacteristicValue {
    switch (playing) {
      case Playing.PLAY:
        return this.platform.Characteristic.TargetMediaState.PLAY;
      case Playing.PAUSE:
        return this.platform.Characteristic.TargetMediaState.PAUSE;
      case Playing.STOP:
      case Playing.UNSUPPORTED:
        return this.platform.Characteristic.TargetMediaState.STOP;
    }
  }

  async getMute(): Promise<CharacteristicValue> {
    return this.queryDevice("getMute", "mute status", (raceStatus) => this.denonClient.getMute(raceStatus));
  }

  async getVolume(): Promise<CharacteristicValue> {
    const volume = await this.queryDevice("getVolume", "volume", (raceStatus) => this.denonClient.getVolume(raceStatus));
    return this.adjustBackFromVolumeLimit(volume);
  }

  /**
   * Runs a query against the device and races it against the HomeKit callback timeout.
   * If the device answers too late, the client pushes the value to HomeKit via the update callbacks instead.
   * Any failure is logged and reported to HomeKit as SERVICE_COMMUNICATION_FAILURE.
   */
  private async queryDevice<T>(operation: string, description: string, request: (raceStatus: RaceStatus) => Promise<T>): Promise<T> {
    const raceStatus = new RaceStatus();
    this.log.debug(`${operation} for ${this.name}. [race id: ${raceStatus.raceId}]`);

    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        request(raceStatus),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            raceStatus.setRaceOver();
            reject(new PromiseTimeoutException(DenonAudioAccessory.CALLBACK_TIMEOUT));
          }, DenonAudioAccessory.CALLBACK_TIMEOUT);
        }),
      ]);
    } catch (error) {
      if (error instanceof PromiseTimeoutException) {
        this.log.debug(`${this.name} lost its promise race for ${operation}(). [race id: ${raceStatus.raceId}]`);
      } else if (error instanceof ResponseTimeoutException) {
        this.log.debug(`${this.name} response timed out for ${operation}(). [race id: ${raceStatus.raceId}]`, error);
      } else {
        this.log.error(`An error occured while getting ${description} for ${this.name}. [race id: ${raceStatus.raceId}]`, error);
      }
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      clearTimeout(timer);
    }
  }

  /*
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setIdentify(value: CharacteristicValue) {
    this.log.info("Triggered SET Identify:", value);
  }

  async setActive(newValue: CharacteristicValue) {
    this.log.debug(`setActive for ${this.name} set to ${newValue}`);
    const active = newValue === this.platform.Characteristic.Active.ACTIVE;
    // Report the requested state right away: switching on can take a few seconds (e.g. when the power on favorite is
    // started), and the device reports intermediate states during that time.
    this.pendingActive = { value: active, until: Number.POSITIVE_INFINITY };
    this.powerChangeInProgress = true;
    // HomeKit gets the answer immediately; switching continues in the background. Otherwise HomeKit / the Homebridge UI
    // would show the old state until switching on has finished (which can take several seconds).
    this.powerChange = this.denonClient
      .setPower(active)
      .then(() => {
        this.pendingActive = { value: active, until: Date.now() + DenonAudioAccessory.POWER_STATE_SETTLE_TIME };
      })
      .catch(async (error) => {
        this.pendingActive = undefined;
        this.log.error(`An error occured while setting power status for ${this.name}.`, error);
        // show the real state again
        const deviceState = await this.denonClient.getPower().catch(() => !active);
        this.tvService.updateCharacteristic(this.platform.Characteristic.Active, deviceState);
      })
      .finally(() => {
        this.powerChangeInProgress = false;
      });
  }

  async setActiveIdentifier(newValue: CharacteristicValue) {
    this.log.debug(`setActiveIdentifier for ${this.name} set to ${newValue}`);

    if (!this.configuredInputsByIdentifier.has(newValue as number)) {
      this.log.error(`An error occured while setting input for ${this.name}. Input identifier ${newValue} is not configured.`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }

    try {
      await this.denonClient.setInput(this.configuredInputsByIdentifier.get(newValue as number)!.inputID);
    } catch (error) {
      this.log.error(`An error occured while setting input for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setRemoteKey(remoteKey: CharacteristicValue) {
    switch (remoteKey) {
      case this.platform.Characteristic.RemoteKey.REWIND: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.FAST_FORWARD: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.NEXT_TRACK: {
        // unsupported in iOS
        await this.setPlayNext();
        break;
      }
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK: {
        // unsupported in iOS
        await this.setPlayPrevious();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_UP: {
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN: {
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT: {
        await this.setPlayPrevious();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT: {
        await this.setPlayNext();
        break;
      }
      case this.platform.Characteristic.RemoteKey.SELECT: {
        await this.setPlayPauseToggle();
        break;
      }
      case this.platform.Characteristic.RemoteKey.BACK: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.EXIT: {
        // unsupported in iOS
        break;
      }
      case this.platform.Characteristic.RemoteKey.PLAY_PAUSE: {
        await this.setPlayPauseToggle();
        break;
      }
      case this.platform.Characteristic.RemoteKey.INFORMATION: {
        break;
      }
    }
  }

  async setTargetMediaState(newValue: CharacteristicValue) {
    this.log.debug(`setTargetMediaState for ${this.name} set to ${newValue}`);

    let target: Playing;
    switch (newValue) {
      case this.platform.Characteristic.TargetMediaState.PLAY:
        target = Playing.PLAY;
        break;
      case this.platform.Characteristic.TargetMediaState.PAUSE:
        target = Playing.PAUSE;
        break;
      case this.platform.Characteristic.TargetMediaState.STOP:
        target = Playing.STOP;
        break;
      default:
        this.log.warn(`Unexpected target media state for ${this.name}: ${newValue}`);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
    }

    if (this.playingChangeOngoing) {
      this.log.debug(`setTargetMediaState for ${this.name} was called while another play state change is still ongoing. Ignoring this call.`);
      return;
    }

    try {
      this.playingChangeOngoing = true;
      this.targetMediaState = target;
      await this.denonClient.setPlaying(target);
    } catch (error) {
      this.log.error(`An error occured while setting the play state for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.targetMediaState = undefined;
      this.playingChangeOngoing = false;
    }
  }

  async setPlayPauseToggle() {
    this.log.debug(`setPlayPauseToggle for ${this.name}`);
    if (this.playingChangeOngoing) {
      this.log.debug(`setPlayPauseToggle for ${this.name} was called while another play state change is still ongoing. Ignoring this call.`);
      return;
    }

    try {
      this.playingChangeOngoing = true;
      const currentPlaying = await this.getPlaying();
      switch (currentPlaying) {
        case Playing.PLAY:
          this.targetMediaState = Playing.PAUSE;
          break;
        case Playing.PAUSE:
        case Playing.STOP:
          this.targetMediaState = Playing.PLAY;
          break;
        case Playing.UNSUPPORTED:
          return;
      }
      await this.denonClient.setPlaying(this.targetMediaState);
    } catch (error) {
      this.log.error(`An error occured while toggling play/pause for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.targetMediaState = undefined;
      this.playingChangeOngoing = false;
    }
  }

  async setPlayNext() {
    this.log.debug(`setPlayNext for ${this.name}`);
    try {
      await this.denonClient.setPlayNext();
    } catch (error) {
      this.log.error(`An error occured while setting play next for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setPlayPrevious() {
    this.log.debug(`setPlayPrevious for ${this.name}`);
    try {
      await this.denonClient.setPlayPrevious();
    } catch (error) {
      this.log.error(`An error occured while setting play previous for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setMute(newValue: CharacteristicValue) {
    this.log.debug(`setMute for ${this.name} set to ${newValue}`);
    try {
      await this.denonClient.setMute(newValue as boolean);
    } catch (error) {
      this.log.error(`An error occured while setting mute status for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setVolume(newValue: CharacteristicValue) {
    this.log.debug(`setVolume for ${this.name} set to ${newValue}`);
    if (this.volumeChangeOngoing) {
      this.log.debug(`setVolume for ${this.name} was called while another volume change is still ongoing. Ignoring this call.`);
      return;
    }

    try {
      this.volumeChangeOngoing = true;
      this.lastSetVolume = newValue as number;
      await this.denonClient.setVolume(toDeviceVolume(newValue as number, this.volumeLimit));
    } catch (error) {
      this.log.error(`An error occured while setting volume for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.volumeChangeOngoing = false;
    }
  }

  async setVolumeSelector(direction: CharacteristicValue) {
    if (this.volumeChangeOngoing) {
      this.log.debug(`setVolumeSelector for ${this.name} was called while another volume change is still ongoing. Ignoring this call.`);
      return;
    }

    try {
      this.volumeChangeOngoing = true;
      this.log.debug(`setVolumeSelector for ${this.name} set to ${direction}`);
      if (direction === this.platform.Characteristic.VolumeSelector.INCREMENT) {
        if (this.volumeLimit !== undefined) {
          const headroom = this.volumeLimit - (await this.denonClient.getVolume());
          if (headroom > 0) {
            await this.denonClient.setVolumeUp(Math.min(headroom, this.volumeStepSize));
          }
          // otherwise: volume limit reached, do nothing
        } else {
          await this.denonClient.setVolumeUp(this.volumeStepSize);
        }
      } else if (direction === this.platform.Characteristic.VolumeSelector.DECREMENT) {
        await this.denonClient.setVolumeDown(this.volumeStepSize);
      }
    } catch (error) {
      this.log.error(`An error occured while changing the volume for ${this.name}.`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.volumeChangeOngoing = false;
    }
  }

  /*
   * Handles characteristic updates from the API
   */
  private callbackActive(active: boolean) {
    if (this.powerChangeInProgress && this.pendingActive && this.pendingActive.value !== active) {
      this.log.debug(`Ignoring intermediate power state ${active} of ${this.name} while switching.`);
      return;
    }
    if (this.pendingActive && this.pendingActive.value !== active) {
      // changed on the device (e.g. in the HEOS app) - the device state wins
      this.pendingActive = undefined;
    }
    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, active);
  }

  private callbackMute(mute: boolean) {
    this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, mute);
  }

  private callbackVolume(volume: number) {
    this.speakerService.updateCharacteristic(this.platform.Characteristic.Volume, this.adjustBackFromVolumeLimit(volume));
  }

  private callbackInput(inputID: string) {
    const inputIdentifier = this.configuredInputsByInputId.get(inputID)?.identifier || this.unknownInput.identifier;
    this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, inputIdentifier);
  }

  /*
   * Volume Limit Helpers
   */
  private adjustBackFromVolumeLimit(volume: number) {
    return fromDeviceVolume(volume, this.volumeLimit, this.lastSetVolume);
  }
}

class ConfiguredInput {
  inputID: string;
  displayName: string;
  showInList: boolean;
  identifier: number;
  userDefined: boolean;

  constructor(inputID: string, displayName: string, showInList: boolean, identifier: number, userDefined: boolean) {
    this.inputID = inputID;
    this.displayName = displayName;
    this.showInList = showInList;
    this.identifier = identifier;
    this.userDefined = userDefined;
  }
}
