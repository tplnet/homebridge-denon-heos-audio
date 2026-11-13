import { DefaultInput, IDenonClient, Playing, RaceStatus } from "./denonClient.js";
import { DenonClientAvrControl } from "./denonClientAvrControl.js";
import { DenonClientHeosCli } from "./denonClientHeosCli.js";
import { ControlMode } from "./controlMode.js";

export class DenonClientHybrid implements IDenonClient {
  public readonly controlMode = ControlMode.HYBRID;
  public readonly serialNumber: string;
  public readonly name: string;
  public readonly defaultInputs = DenonClientHeosCli.DEFAULT_INPUT_SOURCES;
  public readonly displayOnlyInputs = DenonClientHeosCli.DISPLAY_ONLY_INPUT_SOURCES;

  private readonly clientAvrControl;
  private readonly clientHeosCli;

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
    return this.clientAvrControl.isConnected() || this.clientHeosCli.isConnected();
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

  public getInputSources(): Promise<DefaultInput[] | undefined> {
    return this.clientHeosCli.getInputSources();
  }
}
