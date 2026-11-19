import {
  DefaultInput,
  IDenonClient,
  Playing,
  RaceStatus,
} from "./denonClient.js";
import { DenonClientAvrControl } from "./denonClientAvrControl.js";
import { DenonClientHeosCli } from "./denonClientHeosCli.js";
import { ControlMode } from "./controlMode.js";

export class DenonClientHybrid implements IDenonClient {
  public readonly controlMode = ControlMode.HYBRID;
  public readonly serialNumber: string;
  public readonly name: string;
  public readonly defaultInputs = DenonClientHeosCli.DEFAULT_INPUT_SOURCES;
  public readonly displayOnlyInputs =
    DenonClientHeosCli.DISPLAY_ONLY_INPUT_SOURCES;

  private readonly clientAvrControl;
  private readonly clientHeosCli;
  private readonly debugLog: (message: string, ...parameters: any[]) => void;
  private readonly inputUpdateCallback?: (input: string) => void;
  /** HEOS input ids of the device (from getInputSources), used to map AVR Control input codes. */
  private knownInputIds: string[] = [];

  /**
   * AVR Control input codes (SI…) whose HEOS input id differs from the lower-case code.
   * Several candidates: the first one the device offers is used.
   */
  private static readonly AVR_TO_HEOS_INPUTS: Record<string, string[]> = {
    BD: ["bluray"],
    "CBL/SAT": ["cable_sat"],
    "SAT/CBL": ["cable_sat"],
    SAT: ["cable_sat"],
    MPLAY: ["mediaplayer"],
    TV: ["tvaudio", "tv"],
    GAME: ["game"],
    GAME1: ["game", "game1"],
    GAME2: ["game2"],
    "8K": ["aux_8k"],
    PHONO: ["phono"],
    CD: ["cd"],
    DVD: ["dvd"],
    TUNER: ["tuner"],
    HDRADIO: ["hdradio"],
  };

  /** AVR Control input codes of HEOS music sources (streaming, Bluetooth, USB …): HEOS knows the actual source. */
  private static readonly AVR_STREAMING_INPUTS = [
    "NET",
    "BT",
    "USB",
    "USB/IPOD",
    "IPOD",
    "IPD",
    "SERVER",
    "IRADIO",
    "IRP",
    "FAVORITES",
    "SPOTIFY",
    "AIRPLAY",
    "FVP",
    "MXPORT",
  ];

  /**
   * HEOS input id candidates for an input code reported by AVR Control (e.g. "AUX1" → ["aux1"]).
   * Returns an empty array for HEOS music sources, which are taken from HEOS instead.
   */
  public static heosInputCandidates(avrInput: string): string[] {
    const code = avrInput.trim().toUpperCase();
    if (DenonClientHybrid.AVR_STREAMING_INPUTS.includes(code)) {
      return [];
    }
    return DenonClientHybrid.AVR_TO_HEOS_INPUTS[code] ?? [code.toLowerCase()];
  }

  /**
   * HEOS input id for an input code reported by AVR Control, or undefined if HEOS has to be asked.
   * Prefers a candidate the device actually offers; without a known input list the first candidate is used.
   */
  public static heosInputFromAvrInput(
    avrInput: string,
    knownInputIds: string[],
  ): string | undefined {
    const candidates = DenonClientHybrid.heosInputCandidates(avrInput);
    if (knownInputIds.length === 0) {
      return candidates[0];
    }
    return candidates.find((candidate) => knownInputIds.includes(candidate));
  }

  constructor(
    serialNumber: string,
    name: string,
    host: string,
    connect_timeout: number,
    response_timeout: number,
    debugLogCallback?: (message: string, ...parameters: any[]) => void,
    powerUpdateCallback?: (power: boolean) => void,
    muteUpdateCallback?: (mute: boolean) => void,
    volumeUpdateCallback?: (volume: number) => void,
    inputUpdateCallback?: (input: string) => void,
  ) {
    this.debugLog = debugLogCallback ?? (() => {});
    this.inputUpdateCallback = inputUpdateCallback;
    // HEOS doesn't report an input changed at the receiver itself, AVR Control does ("SI…").
    this.clientAvrControl = new DenonClientAvrControl(
      serialNumber,
      name,
      host,
      connect_timeout,
      response_timeout,
      debugLogCallback,
      powerUpdateCallback,
      undefined,
      undefined,
      inputUpdateCallback
        ? (avrInput) => this.onAvrInputChanged(avrInput)
        : undefined,
    );
    this.clientHeosCli = new DenonClientHeosCli(
      serialNumber,
      name,
      host,
      connect_timeout,
      response_timeout,
      debugLogCallback,
      undefined,
      muteUpdateCallback,
      volumeUpdateCallback,
      inputUpdateCallback,
    );
    this.serialNumber = serialNumber;
    this.name = name;
  }

  public isConnected(): boolean {
    return (
      this.clientAvrControl.isConnected() || this.clientHeosCli.isConnected()
    );
  }

  public getPower(): Promise<boolean> {
    return this.clientAvrControl.getPower();
  }

  public setPower(power: boolean): Promise<boolean> {
    return this.clientAvrControl.setPower(power);
  }

  public getPlaying(raceStatus: RaceStatus): Promise<Playing> {
    return this.clientHeosCli.getPlaying(raceStatus);
  }

  public setPlaying(playing: Playing): Promise<Playing> {
    return this.clientHeosCli.setPlaying(playing);
  }

  public async setPlayNext(): Promise<void> {
    return this.clientHeosCli.setPlayNext();
  }

  public async setPlayPrevious(): Promise<void> {
    return this.clientHeosCli.setPlayPrevious();
  }

  public getMute(raceStatus?: RaceStatus): Promise<boolean> {
    return this.clientHeosCli.getMute(raceStatus);
  }

  public setMute(mute: boolean): Promise<boolean> {
    return this.clientHeosCli.setMute(mute);
  }

  public getVolume(raceStatus?: RaceStatus): Promise<number> {
    return this.clientHeosCli.getVolume(raceStatus);
  }

  public setVolume(volume: number): Promise<number> {
    return this.clientHeosCli.setVolume(volume);
  }

  public setVolumeUp(volumeIncrement: number): Promise<void> {
    return this.clientHeosCli.setVolumeUp(volumeIncrement);
  }

  public setVolumeDown(volumeDecrement: number): Promise<void> {
    return this.clientHeosCli.setVolumeDown(volumeDecrement);
  }

  public getInput(raceStatus?: RaceStatus): Promise<string> {
    return this.clientHeosCli.getInput(raceStatus);
  }

  public async setInput(inputID: string): Promise<string> {
    return this.clientHeosCli.setInput(inputID);
  }

  public async getInputSources(): Promise<DefaultInput[] | undefined> {
    const inputs = await this.clientHeosCli.getInputSources();
    this.knownInputIds = inputs.map((input) => input.inputID);
    return inputs;
  }

  private onAvrInputChanged(avrInput: string) {
    const inputID = DenonClientHybrid.heosInputFromAvrInput(
      avrInput,
      this.knownInputIds,
    );
    if (inputID) {
      this.debugLog(`Input changed on the receiver: ${avrInput} → ${inputID}`);
      this.inputUpdateCallback?.(inputID);
      return;
    }
    // a HEOS music source or an input HEOS doesn't offer: ask HEOS for the current source
    this.clientHeosCli
      .getInput()
      .then((heosInput) => {
        this.debugLog(
          `Input changed on the receiver: ${avrInput} → ${heosInput} (from HEOS)`,
        );
        this.inputUpdateCallback?.(heosInput);
      })
      .catch((error) =>
        this.debugLog(
          `Could not read the current input after the receiver reported ${avrInput}:`,
          error instanceof Error ? error.message : error,
        ),
      );
  }
}
