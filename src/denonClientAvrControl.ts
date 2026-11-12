import {
  CommandMode,
  ConnectionTimeoutException,
  DefaultInput,
  DenonClient,
  findMapByValue,
  findValueByMap,
  InvalidResponseException,
  Playing,
} from "./denonClient.js";
import * as DenonProtocol from "./denonProtocol.js";

export class DenonClientAvrControl extends DenonClient {
  public readonly controlMode = DenonProtocol.ControlMode.AVRCONTROL;

  protected static readonly PROTOCOL = {
    POWER: {
      GET: {
        COMMAND: "PW?",
        PARAMS: "",
        EXP_RES: /^PW(\w+)$/,
      },
      SET: {
        COMMAND: "PW",
        PARAMS: "[VALUE]",
        EXP_RES: /^PW(\w+)$/,
      },
      VALUES: {
        ON: {
          VALUE: "ON",
          MAP: true,
        },
        OFF: {
          VALUE: "STANDBY",
          MAP: false,
        },
      },
    },
    MUTE: {
      GET: {
        COMMAND: "MU?",
        PARAMS: "",
        EXP_RES: /^MU(\w+)$/,
      },
      SET: {
        COMMAND: "MU",
        PARAMS: "[VALUE]",
        EXP_RES: /^MU(\w+)$/,
      },
      VALUES: {
        ON: {
          VALUE: "ON",
          MAP: true,
        },
        OFF: {
          VALUE: "OFF",
          MAP: false,
        },
      },
    },
    VOLUME: {
      GET: {
        COMMAND: "MV?",
        PARAMS: "",
        EXP_RES: /^MV(\d{2})5?$/,
      },
      SET: {
        COMMAND: "MV",
        PARAMS: "[VALUE]",
        EXP_RES: /^MV(\d{2})5?$/,
      },
    },
    VOLUME_UP: {
      SET: {
        COMMAND: "MVUP",
      },
    },
    VOLUME_DOWN: {
      SET: {
        COMMAND: "MVDOWN",
      },
    },
    INPUT: {
      GET: {
        COMMAND: "SI?",
        PARAMS: "",
        EXP_RES: /^SI(\w+)$/,
      },
      SET: {
        COMMAND: "SI",
        PARAMS: "[VALUE]",
        EXP_RES: /^SI(\w+)$/,
      },
    },
  };

  public static readonly DEFAULT_INPUT_SOURCES = [
    new DefaultInput("ANALOG1", "Analog 1"),
    new DefaultInput("ANALOG2", "Analog 2"),
    new DefaultInput("AUX1", "AUX 1"),
    new DefaultInput("AUX2", "AUX 2"),
    new DefaultInput("BD", "Blu-ray"),
    new DefaultInput("CBL/SAT", "Cable/SAT"),
    new DefaultInput("CD", "CD"),
    new DefaultInput("DOCK", "Dock"),
    new DefaultInput("DVD", "DVD"),
    new DefaultInput("FAVORITES", "Favorites"),
    new DefaultInput("GAME", "Game"),
    new DefaultInput("GAME2", "Game 2"),
    new DefaultInput("IPOD", "iPod"),
    new DefaultInput("IRADIO", "Internet Radio"),
    new DefaultInput("IRP", "Internet Radio Presets"),
    new DefaultInput("LASTFM", "LastFM"),
    new DefaultInput("MPLAY", "Music Play"),
    new DefaultInput("NET", "Local Network"),
    new DefaultInput("NET/USB", "Network/USB"),
    new DefaultInput("NETWORK", "Network"),
    new DefaultInput("OPTICAL1", "Optical 1"),
    new DefaultInput("OPTICAL2", "Optical 2"),
    new DefaultInput("PANDORA", "Pandora"),
    new DefaultInput("RHAPSODY", "Rhapsody"),
    new DefaultInput("SAT/CBL", "SAT/Cable"),
    new DefaultInput("SERVER", "Media Server"),
    new DefaultInput("SPOTIFY", "Spotify"),
    new DefaultInput("TUNER", "Tuner"),
    new DefaultInput("TV", "TV"),
    new DefaultInput("USB", "USB"),
  ];

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
    super(
      serialNumber,
      name,
      {
        host: host,
        port: DenonProtocol.ControlMode.AVRCONTROL,
        connect_timeout: connect_timeout,
        response_timeout: response_timeout,
        command_prefix: undefined,
        command_separator: "\r\n",
        response_separator: "\r",
        all_responses_to_generic: false,
      },
      DenonClientAvrControl.DEFAULT_INPUT_SOURCES,
      debugLogCallback,
      powerUpdateCallback,
      muteUpdateCallback,
      volumeUpdateCallback,
      inputUpdateCallback,
    );

    this.connect().catch((error) => {
      // A new connection attempt is made lazily before the next command, so a failure here is not fatal.
      if (error instanceof ConnectionTimeoutException) {
        this.debugLog(`Error connecting client '${this.name}' at ${this.params.host}:${this.params.port} -`, error.message);
      } else {
        this.debugLog(`Error connecting client '${this.name}' -`, error instanceof Error ? error.message : error);
      }
    });
  }

  protected async subscribeToChangeEvents(): Promise<void> {
    // not necessary - change events are automatically sent in AVR control
  }

  protected responseRouter(response: string) {
    if (this.responseCallback) {
      let out: string | undefined = undefined;
      if (this.responseCallback.expectedResponse) {
        const match = response.match(this.responseCallback.expectedResponse);
        if (match) {
          out = match[1] ?? match[0];
        }
      } else {
        out = response;
      }

      if (out) {
        this.debugLog("Received response:", response);
        this.responseCallback.callback(out);
        this.responseCallback = undefined;
        if (this.params.all_responses_to_generic) {
          this.genericResponseHandler(response);
        }
      }
    } else {
      this.genericResponseHandler(response);
    }
  }

  private genericResponseHandler(response: string) {
    this.debugLog("Received data event:", response);

    // Power
    let match = response.match(DenonClientAvrControl.PROTOCOL.POWER.GET.EXP_RES);
    if (match) {
      const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.POWER.VALUES, match[1]);
      if (mappedValue === undefined) {
        throw new InvalidResponseException(
          "Unexpected power state",
          Object.values(DenonClientAvrControl.PROTOCOL.POWER.VALUES).map((value) => value.VALUE),
          match[1],
        );
      }

      if (this.powerUpdateCallback) {
        this.powerUpdateCallback(mappedValue);
      }
      return;
    }

    // Mute
    match = response.match(DenonClientAvrControl.PROTOCOL.MUTE.GET.EXP_RES);
    if (match) {
      const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, match[1]);
      if (mappedValue === undefined) {
        throw new InvalidResponseException(
          "Unexpected mute state",
          Object.values(DenonClientAvrControl.PROTOCOL.MUTE.VALUES).map((value) => value.VALUE),
          match[1],
        );
      }

      if (this.muteUpdateCallback) {
        this.muteUpdateCallback(mappedValue);
      }
      return;
    }

    // Volume
    match = response.match(DenonClientAvrControl.PROTOCOL.VOLUME.GET.EXP_RES);
    if (match) {
      if (this.volumeUpdateCallback) {
        this.volumeUpdateCallback(Number(match[1]));
      }
      return;
    }

    // Input
    match = response.match(DenonClientAvrControl.PROTOCOL.INPUT.GET.EXP_RES);
    if (match) {
      if (this.inputUpdateCallback) {
        this.inputUpdateCallback(match[1]);
      }
      return;
    }
  }

  public async getPower(): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.POWER, CommandMode.GET, {});
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.POWER.VALUES, response);
    return mappedValue;
  }

  public async setPower(power: boolean): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.POWER, CommandMode.SET, {
      value: findValueByMap(DenonClientAvrControl.PROTOCOL.POWER.VALUES, power),
    });
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.POWER.VALUES, response);
    return mappedValue;
  }

  public async getPlaying(): Promise<Playing> {
    // not supported
    return Playing.UNSUPPORTED;
  }

  public async setPlaying(): Promise<Playing> {
    // not supported
    return Playing.UNSUPPORTED;
  }

  public async setPlayNext(): Promise<void> {
    // not supported
  }

  public async setPlayPrevious(): Promise<void> {
    // not supported
  }

  public async getMute(): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.MUTE, CommandMode.GET, {});
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, response);
    return mappedValue;
  }

  public async setMute(mute: boolean): Promise<boolean> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.MUTE, CommandMode.SET, {
      value: findValueByMap(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, mute),
    });
    const mappedValue = findMapByValue(DenonClientAvrControl.PROTOCOL.MUTE.VALUES, response);
    return mappedValue;
  }

  public async getVolume(): Promise<number> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.VOLUME, CommandMode.GET, {});
    return Number(response);
  }

  public async setVolume(volume: number): Promise<number> {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }

    if (volume === 100) {
      volume = 99;
    }

    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.VOLUME, CommandMode.SET, {
      value: Math.round(volume).toString().padStart(2, "0"),
    });
    return Number(response);
  }

  public async setVolumeUp(volumeIncrement: number): Promise<void> {
    if (volumeIncrement < 1 || volumeIncrement > 10) {
      throw new Error("Volume increment must be between 1 and 10");
    }

    for (let i = 0; i < Math.round(volumeIncrement); i++) {
      await this.sendCommand(DenonClientAvrControl.PROTOCOL.VOLUME_UP, CommandMode.SET, {});
    }
  }

  public async setVolumeDown(volumeDecrement: number): Promise<void> {
    if (volumeDecrement < 1 || volumeDecrement > 10) {
      throw new Error("Volume decrement must be between 1 and 10");
    }

    for (let i = 0; i < Math.round(volumeDecrement); i++) {
      await this.sendCommand(DenonClientAvrControl.PROTOCOL.VOLUME_DOWN, CommandMode.SET, {});
    }
  }

  public async getInput(): Promise<string> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.INPUT, CommandMode.GET, {});
    return response;
  }

  public async setInput(inputID: string): Promise<string> {
    const response = await this.sendCommand(DenonClientAvrControl.PROTOCOL.INPUT, CommandMode.SET, {
      value: inputID,
    });
    return response;
  }
}
