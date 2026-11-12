import {
  CommandFailedException,
  CommandMode,
  ConnectionTimeoutException,
  DefaultInput,
  DenonClient,
  findValueByMap,
  InvalidResponseException,
  isPlaying,
  mapResponse,
  Playing,
  ProtocolCommand,
  RaceStatus,
} from "./denonClient.js";
import * as DenonProtocol from "./denonProtocol.js";

interface HeosResponse {
  heos: {
    command: string;
    result?: string;
    success?: string;
    message?: string;
  };
  payload?: unknown;
}

export class DenonClientHeosCli extends DenonClient {
  public readonly controlMode = DenonProtocol.ControlMode.HEOSCLI;

  protected static readonly PROTOCOL = {
    GLOBAL_CHANGE_EVENT_REGEX: /^event\/(\w+)$/,
    PID_REGEX: /pid=(\d+)/,
    EVENT_SUB: {
      SET: {
        COMMAND: "system/register_for_change_events",
        PARAMS: "?enable=[VALUE]",
        EXP_RES: /enable=(\w+)/,
      },
      VALUES: {
        ON: {
          VALUE: "on",
          MAP: true,
        },
        OFF: {
          VALUE: "off",
          MAP: false,
        },
      },
    },
    PLAYERS: {
      GET: {
        COMMAND: "player/get_players",
        PARAMS: "",
        EXP_RES: /^$/,
      },
    },
    PLAY_STATE: {
      GET: {
        COMMAND: "player/get_play_state",
        PARAMS: "?pid=[PID]",
        EXP_RES: /state=(\w+)/,
      },
      SET: {
        COMMAND: "player/set_play_state",
        PARAMS: "?pid=[PID]&state=[VALUE]",
        EXP_RES: /state=(\w+)/,
      },
      EVENT: {
        COMMAND: "event/player_state_changed",
        EXP_RES: /state=(\w+)/,
      },
      VALUES: {
        PLAY: {
          VALUE: "play",
          MAP: Playing.PLAY,
        },
        PAUSE: {
          VALUE: "pause",
          MAP: Playing.PAUSE,
        },
        STOP: {
          VALUE: "stop",
          MAP: Playing.STOP,
        },
      },
    },
    PLAY_NEXT: {
      SET: {
        COMMAND: "player/play_next",
        PARAMS: "?pid=[PID]",
        EXP_RES: /.*/,
      },
    },
    PLAY_PREVIOUS: {
      SET: {
        COMMAND: "player/play_previous",
        PARAMS: "?pid=[PID]",
        EXP_RES: /.*/,
      },
    },
    MUTE: {
      GET: {
        COMMAND: "player/get_mute",
        PARAMS: "?pid=[PID]",
        EXP_RES: /state=(\w+)/,
      },
      SET: {
        COMMAND: "player/set_mute",
        PARAMS: "?pid=[PID]&state=[VALUE]",
        EXP_RES: /state=(\w+)/,
      },
      EVENT: {
        COMMAND: "event/player_volume_changed",
        EXP_RES: /mute=(\w+)/,
      },
      VALUES: {
        ON: {
          VALUE: "on",
          MAP: true,
        },
        OFF: {
          VALUE: "off",
          MAP: false,
        },
      },
    },
    VOLUME: {
      GET: {
        COMMAND: "player/get_volume",
        PARAMS: "?pid=[PID]",
        EXP_RES: /level=(\d+)/,
      },
      SET: {
        COMMAND: "player/set_volume",
        PARAMS: "?pid=[PID]&level=[VALUE]",
        EXP_RES: /level=(\d+)/,
      },
      EVENT: {
        COMMAND: "event/player_volume_changed",
        EXP_RES: /level=(\d+)/,
      },
    },
    VOLUME_UP: {
      SET: {
        COMMAND: "player/volume_up",
        PARAMS: "?pid=[PID]&step=[VALUE]",
        EXP_RES: /step=(\d+)/,
      },
    },
    VOLUME_DOWN: {
      SET: {
        COMMAND: "player/volume_down",
        PARAMS: "?pid=[PID]&step=[VALUE]",
        EXP_RES: /step=(\d+)/,
      },
    },
    INPUT: {
      GET: {
        COMMAND: "player/get_now_playing_media",
        PARAMS: "?pid=[PID]",
        EXP_RES: /.*/,
      },
      SET: {
        COMMAND: "browse/play_input",
        PARAMS: "?pid=[PID]&input=inputs/[VALUE]",
        EXP_RES: /input=inputs\/(\w+)/,
      },
      EVENT: {
        COMMAND: "event/player_now_playing_changed",
        EXP_RES: /.*/,
      }, // TODO implement change event
    },
  };

  public static readonly HEOS_SOURCES = {
    1: new DefaultInput("pandora", "Pandora"),
    2: new DefaultInput("rhapsody", "Rhapsody"),
    3: new DefaultInput("tunein", "TuneIn"),
    4: new DefaultInput("spotify", "Spotify"),
    5: new DefaultInput("deezer", "Deezer"),
    6: new DefaultInput("napster", "Napster"),
    7: new DefaultInput("iheartradio", "iHeartRadio"),
    8: new DefaultInput("siriusxm", "SiriusXM"),
    9: new DefaultInput("soundcloud", "SoundCloud"),
    10: new DefaultInput("tidal", "Tidal"),
    12: new DefaultInput("rdio", "Rdio"),
    13: new DefaultInput("amazonmusic", "Amazon Music"),
    15: new DefaultInput("moodmix", "Mood Mix"),
    16: new DefaultInput("juke", "Juke"),
    18: new DefaultInput("qqmusic", "QQ Music"),
    30: new DefaultInput("qobuz", "qobuz"),
    1024: new DefaultInput("local", "Local Network"),
    1025: new DefaultInput("heos_playlists", "HEOS Playlists"),
    1026: new DefaultInput("heos_history", "HEOS History"),
    1027: new DefaultInput("heos_auxinputs", "AUX Inputs"),
    1028: new DefaultInput("heos_favorites", "HEOS Favorites"),
  } as const;

  public static readonly INPUT_SOURCES = [
    new DefaultInput("aux_in_1", "AUX In 1"),
    new DefaultInput("aux_in_2", "AUX In 2"),
    new DefaultInput("aux_in_3", "AUX In 3"),
    new DefaultInput("aux_in_4", "AUX In 4"),
    new DefaultInput("aux_single", "AUX Single"),
    new DefaultInput("aux1", "AUX 1"),
    new DefaultInput("aux2", "AUX 2"),
    new DefaultInput("aux3", "AUX 3"),
    new DefaultInput("aux4", "AUX 4"),
    new DefaultInput("aux5", "AUX 5"),
    new DefaultInput("aux6", "AUX 6"),
    new DefaultInput("aux7", "AUX 7"),
    new DefaultInput("aux_8k", "AUX 8K"),
    new DefaultInput("line_in_1", "Line In 1"),
    new DefaultInput("line_in_2", "Line In 2"),
    new DefaultInput("line_in_3", "Line In 3"),
    new DefaultInput("line_in_4", "Line In 4"),
    new DefaultInput("coax_in_1", "Coax In 1"),
    new DefaultInput("coax_in_2", "Coax In 2"),
    new DefaultInput("optical_in_1", "Optical In 1"),
    new DefaultInput("optical_in_2", "Optical In 2"),
    new DefaultInput("optical_in_3", "Optical In 3"),
    new DefaultInput("hdmi_in_1", "HDMI In 1"),
    new DefaultInput("hdmi_in_2", "HDMI In 2"),
    new DefaultInput("hdmi_in_3", "HDMI In 3"),
    new DefaultInput("hdmi_in_4", "HDMI In 4"),
    new DefaultInput("hdmi_arc_1", "HDMI ARC 1"),
    new DefaultInput("cable_sat", "Cable/SAT"),
    new DefaultInput("dvd", "DVD"),
    new DefaultInput("bluray", "Blu-ray"),
    new DefaultInput("game", "Game"),
    new DefaultInput("game2", "Game 2"),
    new DefaultInput("mediaplayer", "Media Player"),
    new DefaultInput("cd", "CD"),
    new DefaultInput("tuner", "Tuner"),
    new DefaultInput("hdradio", "HD Radio"),
    new DefaultInput("tvaudio", "TV Audio"),
    new DefaultInput("phono", "Phono"),
    new DefaultInput("usbdac", "USB DAC"),
    new DefaultInput("analog_in_1", "Analog In 1"),
    new DefaultInput("analog_in_2", "Analog In 2"),
    new DefaultInput("recorder_in_1", "Recorder In 1"),
    new DefaultInput("tv", "TV"),
  ];

  public static readonly DEFAULT_INPUT_SOURCES = [
    ...Object.values(DenonClientHeosCli.HEOS_SOURCES),
    ...DenonClientHeosCli.INPUT_SOURCES,
    new DefaultInput("airplay", "AirPlay"),
  ];

  private player_id: number | undefined;

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
        port: DenonProtocol.ControlMode.HEOSCLI,
        connect_timeout: connect_timeout,
        response_timeout: response_timeout,
        command_prefix: "heos://",
        command_separator: "\r\n",
        response_separator: "\r\n",
        all_responses_to_generic: false,
      },
      DenonClientHeosCli.DEFAULT_INPUT_SOURCES,
      debugLogCallback,
      powerUpdateCallback,
      muteUpdateCallback,
      volumeUpdateCallback,
      inputUpdateCallback,
    );

    this.player_id = undefined;
    this.findPlayerId().catch((error) => {
      // The player id is looked up again lazily before the next command, so a failure here is not fatal.
      if (error instanceof ConnectionTimeoutException) {
        this.debugLog(`Error connecting client '${this.name}' at ${this.params.host}:${this.params.port} -`, error.message);
      } else {
        this.debugLog(`Error looking up the player id for '${this.name}' -`, error instanceof Error ? error.message : error);
      }
    });
  }

  private async findPlayerId() {
    const payload_str = await super.sendCommand(DenonClientHeosCli.PROTOCOL.PLAYERS, CommandMode.GET, { passPayload: true });
    const payload = JSON.parse(payload_str);
    if (!Array.isArray(payload)) {
      throw new InvalidResponseException("Payload is not an array!", undefined, payload_str);
    }
    for (const player of payload) {
      if (player.serial === this.serialNumber) {
        this.player_id = player.pid;
        return;
      }
    }
    throw new InvalidResponseException("Player list does not include serial " + this.serialNumber);
  }

  protected async subscribeToChangeEvents(): Promise<void> {
    const commandStr = (DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND + DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.PARAMS).replace(
      "[VALUE]",
      DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES.ON.VALUE,
    );
    const response = await this.sendUnchecked(commandStr, DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.COMMAND, DenonClientHeosCli.PROTOCOL.EVENT_SUB.SET.EXP_RES);
    const enabled = mapResponse(DenonClientHeosCli.PROTOCOL.EVENT_SUB.VALUES, response, "event subscription state");

    if (!enabled) {
      throw new CommandFailedException(commandStr);
    }
  }

  protected async sendCommand(
    command: ProtocolCommand,
    commandMode: CommandMode,
    { value, passPayload = false }: { value?: string; passPayload?: boolean },
  ): Promise<string> {
    if (this.player_id === undefined) {
      await this.findPlayerId();
    }
    return super.sendCommand(command, commandMode, { pid: this.player_id, value: value, passPayload: passPayload });
  }

  protected responseRouter(response: string) {
    let r_obj: HeosResponse;
    try {
      r_obj = JSON.parse(response);
    } catch {
      throw new InvalidResponseException("Received a response that is not valid JSON!", undefined, response);
    }

    if (typeof r_obj?.heos?.command !== "string") {
      throw new InvalidResponseException("Received response that does not follow HeosCLI specifications", undefined, response);
    }

    const pending = this.responseCallback;
    if (!pending || pending.command !== r_obj.heos.command.trim()) {
      this.genericResponseHandler(r_obj);
      return;
    }

    // The HEOS CLI specification uses "result"; "success" is checked for backwards compatibility.
    const result = r_obj.heos.result ?? r_obj.heos.success;
    if (result !== undefined && result !== "success") {
      this.debugLog("Received failure response:", response);
      this.rejectPendingResponse(new CommandFailedException(pending.command));
      return;
    }

    const message = r_obj.heos.message;
    if (message === undefined) {
      this.genericResponseHandler(r_obj);
      return;
    }

    const pid_match = message.match(DenonClientHeosCli.PROTOCOL.PID_REGEX);
    const message_match = !pid_match || Number(pid_match[1]) === this.player_id ? message.match(pending.expectedResponse) : null;
    if (!message_match) {
      this.genericResponseHandler(r_obj);
      return;
    }

    let out = message_match.length > 1 ? message_match[1] : message;
    if (pending.passPayload) {
      if (r_obj.payload === undefined) {
        this.rejectPendingResponse(new InvalidResponseException("Received a response that does not include a payload!", undefined, response));
        return;
      }
      out = JSON.stringify(r_obj.payload);
    }

    this.debugLog("Received response:", response);
    this.responseCallback = undefined;
    pending.callback(out);
    if (this.params.all_responses_to_generic) {
      this.genericResponseHandler(r_obj);
    }
  }

  private genericResponseHandler(r_obj: HeosResponse) {
    const protocol = DenonClientHeosCli.PROTOCOL;
    const command = r_obj.heos.command;
    const message = r_obj.heos.message;

    if (!protocol.GLOBAL_CHANGE_EVENT_REGEX.test(command)) {
      return; // not an event
    }

    if (!message) {
      return; // global events not concerned with a particular player id are not handled
    }

    const pid_match = message.match(protocol.PID_REGEX);
    if (!pid_match || Number(pid_match[1]) !== this.player_id) {
      return; // not this player
    }

    this.debugLog("Received change event:", JSON.stringify(r_obj));

    const matchEvent = (regex: RegExp, description: string): string => {
      const match = message.match(regex);
      if (!match) {
        throw new InvalidResponseException(`Unexpected ${description}`, [regex.toString()], message);
      }
      return match[1];
    };

    switch (command) {
      case protocol.PLAY_STATE.EVENT.COMMAND: {
        const playing = mapResponse(protocol.PLAY_STATE.VALUES, matchEvent(protocol.PLAY_STATE.EVENT.EXP_RES, "play state"), "play state");
        this.powerUpdateCallback?.(isPlaying[playing]);
        break;
      }

      // mute and volume share the same event
      case protocol.VOLUME.EVENT.COMMAND: {
        const mute = mapResponse(protocol.MUTE.VALUES, matchEvent(protocol.MUTE.EVENT.EXP_RES, "mute state"), "mute state");
        this.muteUpdateCallback?.(mute);
        this.volumeUpdateCallback?.(Number(matchEvent(protocol.VOLUME.EVENT.EXP_RES, "volume level")));
        break;
      }

      case protocol.INPUT.EVENT.COMMAND: {
        // 'now playing changed' only gives us an indication that something has changed, but no information on what has changed.
        // Therefore, we need to actively query the current input.
        if (this.inputUpdateCallback) {
          this.sendCommand(protocol.INPUT, CommandMode.GET, { passPayload: true })
            .then((payload_str) => {
              this.inputUpdateCallback?.(DenonClientHeosCli.inputPayloadToInputID(payload_str));
            })
            .catch((error) => {
              this.debugLog("Error while querying the current input after a change event:", error instanceof Error ? error.message : error);
            });
        }
        break;
      }
    }
  }

  private async getPlayingInternal(): Promise<Playing> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_STATE, CommandMode.GET, {});
    const mappedValue = mapResponse(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES, response, "play state");
    return mappedValue;
  }

  public async getPlaying(raceStatus?: RaceStatus): Promise<Playing> {
    const playing = await this.getPlayingInternal();
    if (raceStatus && !raceStatus.isRunning()) {
      this.debugLog(`getPlaying was late to the party [race id: ${raceStatus.raceId}].`);
    }
    return playing;
  }

  public async setPlaying(playing: Playing): Promise<Playing> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_STATE, CommandMode.SET, {
      value: findValueByMap(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES, playing),
    });
    const mappedValue = mapResponse(DenonClientHeosCli.PROTOCOL.PLAY_STATE.VALUES, response, "play state");
    return mappedValue;
  }

  public async setPlayNext(): Promise<void> {
    await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_NEXT, CommandMode.SET, {});
  }

  public async setPlayPrevious(): Promise<void> {
    await this.sendCommand(DenonClientHeosCli.PROTOCOL.PLAY_PREVIOUS, CommandMode.SET, {});
  }

  public async getPower(raceStatus?: RaceStatus): Promise<boolean> {
    const playing = await this.getPlayingInternal();
    if (raceStatus && !raceStatus.isRunning() && this.powerUpdateCallback) {
      this.powerUpdateCallback(isPlaying[playing]);
      this.debugLog(`getPower was late to the party [race id: ${raceStatus.raceId}].`);
    }
    return isPlaying[playing];
  }

  public async setPower(power: boolean): Promise<boolean> {
    const newPlaying = await this.setPlaying(power ? Playing.PLAY : Playing.STOP);
    if (this.powerUpdateCallback) {
      this.powerUpdateCallback(isPlaying[newPlaying]);
    }
    return isPlaying[newPlaying];
  }

  public async getMute(raceStatus?: RaceStatus): Promise<boolean> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.MUTE, CommandMode.GET, {});
    const mappedValue = mapResponse(DenonClientHeosCli.PROTOCOL.MUTE.VALUES, response, "mute state");
    if (raceStatus && !raceStatus.isRunning() && this.muteUpdateCallback) {
      this.muteUpdateCallback(mappedValue);
      this.debugLog(`getMute was late to the party [race id: ${raceStatus.raceId}].`);
    }
    return mappedValue;
  }

  public async setMute(mute: boolean): Promise<boolean> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.MUTE, CommandMode.SET, {
      value: findValueByMap(DenonClientHeosCli.PROTOCOL.MUTE.VALUES, mute),
    });

    const mappedValue = mapResponse(DenonClientHeosCli.PROTOCOL.MUTE.VALUES, response, "mute state");
    if (this.muteUpdateCallback) {
      this.muteUpdateCallback(mappedValue);
    }

    return mappedValue;
  }

  public async getVolume(raceStatus?: RaceStatus): Promise<number> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME, CommandMode.GET, {});
    if (raceStatus && !raceStatus.isRunning() && this.volumeUpdateCallback) {
      this.volumeUpdateCallback(Number(response));
      this.debugLog(`getVolume was late to the party [race id: ${raceStatus.raceId}].`);
    }
    return Number(response);
  }

  public async setVolume(volume: number): Promise<number> {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }

    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME, CommandMode.SET, {
      value: Math.round(volume).toString(),
    });

    if (this.volumeUpdateCallback) {
      this.volumeUpdateCallback(Number(response));
    }

    return Number(response);
  }

  public async setVolumeUp(volumeIncrement: number): Promise<void> {
    if (volumeIncrement < 1 || volumeIncrement > 10) {
      throw new Error("Volume increment must be between 1 and 10");
    }

    await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME_UP, CommandMode.SET, {
      value: Math.round(volumeIncrement).toString(),
    });
  }

  public async setVolumeDown(volumeDecrement: number): Promise<void> {
    if (volumeDecrement < 1 || volumeDecrement > 10) {
      throw new Error("Volume decrement must be between 1 and 10");
    }

    await this.sendCommand(DenonClientHeosCli.PROTOCOL.VOLUME_DOWN, CommandMode.SET, {
      value: Math.round(volumeDecrement).toString(),
    });
  }

  public async getInput(raceStatus?: RaceStatus): Promise<string> {
    const payload_str = await this.sendCommand(DenonClientHeosCli.PROTOCOL.INPUT, CommandMode.GET, { passPayload: true });
    const inputID = DenonClientHeosCli.inputPayloadToInputID(payload_str);

    if (raceStatus && !raceStatus.isRunning() && this.inputUpdateCallback) {
      this.inputUpdateCallback(inputID);
      this.debugLog(`getInput was late to the party [race id: ${raceStatus.raceId}].`);
    }
    return inputID;
  }

  private static inputPayloadToInputID(payload_str: string) {
    const payload = JSON.parse(payload_str);
    if (!payload.sid) {
      throw new InvalidResponseException("Payload does not include sid!", undefined, payload_str);
    }

    if (payload.mid && typeof payload.mid === "string") {
      if (payload.mid.startsWith("inputs/")) {
        return payload.mid.substring(7);
      } else if (payload.mid.startsWith("cd/")) {
        return "cd";
      }
    }

    const sid = Number(payload.sid) as keyof typeof DenonClientHeosCli.HEOS_SOURCES;
    if (sid in DenonClientHeosCli.HEOS_SOURCES) {
      if (payload.sid === 1024 && payload.album_id === "1") {
        return "airplay";
      } else {
        return DenonClientHeosCli.HEOS_SOURCES[sid].inputID;
      }
    }

    return payload.sid.toString();
  }

  public async setInput(inputID: string): Promise<string> {
    const response = await this.sendCommand(DenonClientHeosCli.PROTOCOL.INPUT, CommandMode.SET, {
      value: inputID,
    });
    return response;
  }
}
