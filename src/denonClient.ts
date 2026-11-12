import { Mutex } from "async-mutex";
import * as net from "net";

interface IDenonClientConnectionParams {
  readonly host: string;
  readonly port: number;
  readonly connect_timeout: number;
  readonly response_timeout: number;
  readonly command_prefix: string | undefined;
  readonly command_separator: string;
  readonly response_separator: string;
  readonly all_responses_to_generic: boolean;
}

export interface IDenonClient {
  readonly serialNumber: string;
  readonly name: string;
  readonly defaultInputs: DefaultInput[];

  isConnected(): boolean;
  getPower(raceStatus?: RaceStatus): Promise<boolean>;
  setPower(power: boolean): Promise<boolean>;
  getPlaying(raceStatus?: RaceStatus): Promise<Playing>;
  setPlaying(playing: Playing): Promise<Playing>;
  setPlayNext(): Promise<void>;
  setPlayPrevious(): Promise<void>;
  getMute(raceStatus?: RaceStatus): Promise<boolean>;
  setMute(mute: boolean): Promise<boolean>;
  getVolume(raceStatus?: RaceStatus): Promise<number>;
  setVolume(volume: number): Promise<number>;
  setVolumeUp(volumeIncrement: number): Promise<void>;
  setVolumeDown(volumeDecrement: number): Promise<void>;
  getInput(raceStatus?: RaceStatus): Promise<string>;
  setInput(inputID: string): Promise<string>;
}

export abstract class DenonClient implements IDenonClient {
  public readonly serialNumber: string;
  public readonly name: string;
  public readonly params;
  public readonly defaultInputs: DefaultInput[];
  private socket: net.Socket | undefined;
  private sendMutex;
  private pendingData: string;
  protected responseCallback: ResponseCallback | undefined;

  protected debugLogCallback;
  protected powerUpdateCallback;
  protected muteUpdateCallback;
  protected volumeUpdateCallback;
  protected inputUpdateCallback;

  constructor(
    serialNumber: string,
    name: string,
    params: IDenonClientConnectionParams,
    defaultInputs: DefaultInput[] = [],
    debugLogCallback?: (message: string, ...parameters: any[]) => void,
    powerUpdateCallback?: (power: boolean) => void,
    muteUpdateCallback?: (mute: boolean) => void,
    volumeUpdateCallback?: (volume: number) => void,
    inputUpdateCallback?: (input: string) => void,
  ) {
    this.serialNumber = serialNumber;
    this.name = name;
    this.params = params;
    this.defaultInputs = defaultInputs;

    this.socket = undefined;
    this.sendMutex = new Mutex();
    this.pendingData = "";
    this.responseCallback = undefined;

    this.debugLogCallback = debugLogCallback;
    this.powerUpdateCallback = powerUpdateCallback;
    this.muteUpdateCallback = muteUpdateCallback;
    this.volumeUpdateCallback = volumeUpdateCallback;
    this.inputUpdateCallback = inputUpdateCallback;
  }

  protected async connect(): Promise<void> {
    const release = await this.sendMutex.acquire();
    try {
      if (!this.isConnected()) {
        await this.connectUnchecked();
      }
      return;
    } finally {
      release();
    }
  }

  protected async connectUnchecked(): Promise<void> {
    this.debugLog("Establishing new connection...");
    this.pendingData = "";
    this.responseCallback = undefined;

    let newSocket: net.Socket | undefined;
    try {
      newSocket = await new Promise<net.Socket>((resolve, reject) => {
        const socket = net.createConnection({
          host: this.params.host,
          port: this.params.port,
          timeout: 0, // no client-side idle timeout
        });

        // No reply at all (device off, SYN dropped) -> this is what fires.
        const connectTimer = setTimeout(() => {
          cleanup();
          socket.destroy();
          reject(new ConnectionTimeoutException(this.params));
        }, this.params.connect_timeout);

        const cleanup = () => {
          clearTimeout(connectTimer);
          socket.removeListener("connect", onConnect);
          socket.removeListener("error", onError);
        };

        const onConnect = () => {
          cleanup();
          this.debugLog("New connection established.");
          resolve(socket);
        };

        const onError = (error: NodeJS.ErrnoException) => {
          cleanup();
          socket.destroy();
          // Host/network unreachable == device is off. Fold into the same exception.
          if (error.code === "EHOSTUNREACH" || error.code === "ENETUNREACH" || error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED") {
            this.debugLog(`Device unreachable (${error.code}).`);
            reject(new ConnectionTimeoutException(this.params));
          } else {
            reject(error);
          }
        };

        socket.once("connect", onConnect);
        socket.once("error", onError);
      });

      // Long-lived handlers, only after we truly have a connection.
      newSocket.on("timeout", () => {
        // client-side idle timeout, not a response timeout.
        this.debugLog("Connection timed out (client-side, idle).");
        this.socket = undefined;
        newSocket?.destroy();
      });
      newSocket.on("close", () => {
        this.debugLog("Connection has closed.");
        if (this.socket === newSocket) {
          this.socket = undefined;
          this.rejectPendingResponse(new Error("Connection closed while waiting for a response."));
        }
      });
      newSocket.on("error", (error) => {
        this.debugLog("Socket error after connect:", error.message);
        this.socket = undefined;
        newSocket?.destroy();
      });
      newSocket.on("data", (data) => this.dataHandler(data));

      this.socket = newSocket;
      await this.subscribeToChangeEvents();
    } catch (error) {
      if (newSocket && !newSocket.destroyed) {
        this.debugLog("Destroying socket.");
        newSocket.destroy();
      }
      this.debugLog("Catching and throwing:", error instanceof Error ? error.message : error);
      throw error;
    }
  }

  protected abstract subscribeToChangeEvents(): Promise<void>;

  protected async sendCommand(
    command: any,
    commandMode: CommandMode,
    { pid, value, passPayload = false }: { value?: string; pid?: number; passPayload?: boolean },
  ): Promise<string> {
    const specCommand = command[CommandMode[commandMode]];
    let commandStr = specCommand.COMMAND;
    if (specCommand.PARAMS) {
      commandStr += specCommand.PARAMS;
    }
    if (pid) {
      commandStr = commandStr.replace("[PID]", pid);
    }
    if (value) {
      commandStr = commandStr.replace("[VALUE]", value);
    }

    if (specCommand.EXP_RES) {
      const response = await this.send(commandStr, specCommand.COMMAND, specCommand.EXP_RES, passPayload);

      if (command.VALUES) {
        const mappedValue = findMapByValue(command.VALUES, response);

        if (mappedValue === undefined) {
          throw new InvalidResponseException(
            `Unexpected response for command ${commandStr}`,
            Object.values(command.VALUES).map((value: any) => value.VALUE),
            response,
          );
        }
      }
      return response;
    } else {
      return await this.send(commandStr, specCommand.COMMAND, undefined, passPayload);
    }
  }

  protected async send(command: string, rawCommand?: string, expectedResponse?: RegExp, passPayload: boolean = false): Promise<string> {
    const release = await this.sendMutex.acquire();
    try {
      if (!this.isConnected()) {
        await this.connectUnchecked();
      }
      return await this.sendUnchecked(command, rawCommand, expectedResponse, passPayload);
    } finally {
      release();
    }
  }

  protected async sendUnchecked(command: string, rawCommand?: string, expectedResponse?: RegExp, passPayload: boolean = false): Promise<string> {
    const fullCommand = this.params.command_prefix ? this.params.command_prefix + command : command;
    this.debugLog("Sending command:", fullCommand);
    const socket = this.socket;
    if (!socket) {
      throw new Error(`Cannot send command '${fullCommand}': not connected.`);
    }

    if (!expectedResponse) {
      socket.write(fullCommand + this.params.command_separator);
      return "";
    }

    let timer: NodeJS.Timeout | undefined;
    return new Promise<string>((resolve, reject) => {
      this.responseCallback = new ResponseCallback(resolve, reject, rawCommand ?? command, expectedResponse, passPayload);
      timer = setTimeout(() => {
        reject(new ResponseTimeoutException(fullCommand, this.params.response_timeout));
      }, this.params.response_timeout);
      socket.write(fullCommand + this.params.command_separator);
    }).finally(() => {
      clearTimeout(timer);
      this.responseCallback = undefined;
    });
  }

  /**
   * Rejects the currently pending command (if any) with the given error.
   */
  protected rejectPendingResponse(error: Error) {
    const pending = this.responseCallback;
    this.responseCallback = undefined;
    pending?.reject(error);
  }

  private dataHandler(incomingData: Buffer | string) {
    // Socket 'data' events are delivered sequentially on the event loop, so no locking is required here.
    const currentData = this.pendingData + incomingData.toString();
    const chunks = currentData.split(this.params.response_separator);
    this.pendingData = chunks.pop() ?? "";

    for (const chunk of chunks) {
      try {
        this.responseRouter(chunk);
      } catch (error) {
        // Never let a malformed or unexpected message escape from the socket event handler,
        // as this would surface as an uncaught exception and take down the whole Homebridge process.
        this.debugLog("Error while processing incoming data:", error instanceof Error ? error.message : error);
      }
    }
  }

  protected abstract responseRouter(response: string): void;

  protected debugLog(message: string, ...parameters: any[]) {
    if (this.debugLogCallback) {
      this.debugLogCallback(message, ...parameters);
    }
  }

  public isConnected(): boolean {
    return this.socket !== undefined;
  }

  public abstract getPower(raceStatus?: RaceStatus): Promise<boolean>;

  public abstract setPower(power: boolean): Promise<boolean>;

  public abstract getPlaying(raceStatus?: RaceStatus): Promise<Playing>;

  public abstract setPlaying(playing: Playing): Promise<Playing>;

  public abstract setPlayNext(): Promise<void>;

  public abstract setPlayPrevious(): Promise<void>;

  public abstract getMute(raceStatus?: RaceStatus): Promise<boolean>;

  public abstract setMute(mute: boolean): Promise<boolean>;

  public abstract getVolume(raceStatus?: RaceStatus): Promise<number>;

  public abstract setVolume(volume: number): Promise<number>;

  public abstract setVolumeUp(volumeIncrement: number): Promise<void>;

  public abstract setVolumeDown(volumeDecrement: number): Promise<void>;

  public abstract getInput(raceStatus?: RaceStatus): Promise<string>;

  public abstract setInput(inputID: string): Promise<string>;
}

export enum CommandMode {
  GET,
  SET,
}

class ResponseCallback {
  public readonly callback: (response: string) => void;
  public readonly reject: (error: Error) => void;
  public readonly command: string;
  public readonly expectedResponse: RegExp;
  public readonly passPayload: boolean;

  constructor(callback: (response: string) => void, reject: (error: Error) => void, command: string, expectedResponse: RegExp, passPayload = false) {
    this.callback = callback;
    this.reject = reject;
    this.command = command;
    this.expectedResponse = expectedResponse;
    this.passPayload = passPayload;
  }
}

export class RaceStatus {
  private static readonly ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  private running = true;
  public readonly raceId = RaceStatus.ID_CHARS[Math.floor(Math.random() * 36)] + RaceStatus.ID_CHARS[Math.floor(Math.random() * 36)];

  public isRunning(): boolean {
    return this.running;
  }

  public setRaceOver() {
    this.running = false;
  }
}

export class DefaultInput {
  public readonly inputID: string;
  public readonly displayName: string;

  constructor(inputID: string, displayName: string) {
    this.inputID = inputID;
    this.displayName = displayName;
  }
}

export enum Playing {
  PLAY,
  PAUSE,
  STOP,
  UNSUPPORTED,
}

export const isPlaying: Record<Playing, boolean> = {
  [Playing.PLAY]: true,
  [Playing.PAUSE]: false,
  [Playing.STOP]: false,
  [Playing.UNSUPPORTED]: false,
};

export function findMapByValue(values: any, mapValue: any) {
  for (const key in values) {
    if (values[key].VALUE === mapValue) {
      return values[key].MAP;
    }
  }

  return undefined;
}

export function findValueByMap(values: any, mapValue: any) {
  for (const key in values) {
    if (values[key].MAP === mapValue) {
      return values[key].VALUE;
    }
  }

  return undefined;
}

export class ConnectionTimeoutException extends Error {
  constructor(params: IDenonClientConnectionParams) {
    super(`connection to ${params.host}:${params.port} timed out after ${params.connect_timeout}ms.`); // Pass the message to the parent Error class
    this.name = "ConnectionTimeoutException"; // Set the error name

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, ConnectionTimeoutException.prototype);
  }
}

export class ResponseTimeoutException extends Error {
  constructor(command: string, timeout: number) {
    super(`response for command '${command}' timed out after ${timeout}ms.`); // Pass the message to the parent Error class
    this.name = "ResponseTimeoutException"; // Set the error name

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, ResponseTimeoutException.prototype);
  }
}

export class CommandFailedException extends Error {
  constructor(command: string) {
    super(`Execution of command "${command}" has failed on the server side.`); // Pass the message to the parent Error class
    this.name = "CommandFailedException"; // Set the error name

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, CommandFailedException.prototype);
  }
}

export class InvalidResponseException extends Error {
  public expectedResponses?: string[];
  public actualResponse?: string;

  constructor(message: string, expectedResponses?: string[], actualResponse?: string) {
    super(InvalidResponseException.buildFullMessage(message, expectedResponses, actualResponse)); // Pass the message to the parent Error class
    this.name = "InvalidResponseException"; // Set the error name
    this.expectedResponses = expectedResponses;
    this.actualResponse = actualResponse;

    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, InvalidResponseException.prototype);
  }

  private static buildFullMessage(message: string, expectedResponses?: string[], actualResponse?: string): string {
    let fullMessage = message;
    //let fullMessage = message;
    if (expectedResponses) {
      if (actualResponse) {
        fullMessage += ` (Actual response: ${JSON.stringify(actualResponse)}; Expected responses: ${expectedResponses.join(" | ")})`;
      } else {
        fullMessage += ` (Expected response: ${expectedResponses.join(" | ")})`;
      }
    } else if (actualResponse) {
      fullMessage += ` (Actual response: ${actualResponse})`;
    }
    return fullMessage;
  }
}
