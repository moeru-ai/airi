import * as _moeru_eventa0 from "@moeru/eventa";
import { UpdateInfo } from "builder-util-runtime";

//#region src/electron-updater/index.d.ts
type AutoUpdaterStatus = 'idle' | 'disabled' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
interface AutoUpdaterProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}
interface AutoUpdaterError {
  message: string;
}
interface AutoUpdaterState {
  status: AutoUpdaterStatus;
  info?: Omit<UpdateInfo, 'path' | 'sha512'>;
  progress?: AutoUpdaterProgress;
  error?: AutoUpdaterError;
}
declare const electronAutoUpdaterStateChanged: _moeru_eventa0.Eventa<AutoUpdaterState>;
declare const autoUpdater: {
  getState: {
    sendEvent: _moeru_eventa0.SendEvent<AutoUpdaterState, undefined, Error, Error>;
    sendEventError: _moeru_eventa0.SendEventError<AutoUpdaterState, undefined, Error, Error>;
    sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<AutoUpdaterState, undefined, Error, Error>;
    sendEventAbort: _moeru_eventa0.SendEventAbort<AutoUpdaterState, undefined, Error, Error>;
    receiveEvent: _moeru_eventa0.ReceiveEvent<AutoUpdaterState, undefined, Error, Error>;
    receiveEventError: _moeru_eventa0.ReceiveEventError<AutoUpdaterState, undefined, Error, Error>;
    receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<AutoUpdaterState, undefined, Error, Error>;
  };
  checkForUpdates: {
    sendEvent: _moeru_eventa0.SendEvent<AutoUpdaterState, undefined, Error, Error>;
    sendEventError: _moeru_eventa0.SendEventError<AutoUpdaterState, undefined, Error, Error>;
    sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<AutoUpdaterState, undefined, Error, Error>;
    sendEventAbort: _moeru_eventa0.SendEventAbort<AutoUpdaterState, undefined, Error, Error>;
    receiveEvent: _moeru_eventa0.ReceiveEvent<AutoUpdaterState, undefined, Error, Error>;
    receiveEventError: _moeru_eventa0.ReceiveEventError<AutoUpdaterState, undefined, Error, Error>;
    receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<AutoUpdaterState, undefined, Error, Error>;
  };
  downloadUpdate: {
    sendEvent: _moeru_eventa0.SendEvent<AutoUpdaterState, undefined, Error, Error>;
    sendEventError: _moeru_eventa0.SendEventError<AutoUpdaterState, undefined, Error, Error>;
    sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<AutoUpdaterState, undefined, Error, Error>;
    sendEventAbort: _moeru_eventa0.SendEventAbort<AutoUpdaterState, undefined, Error, Error>;
    receiveEvent: _moeru_eventa0.ReceiveEvent<AutoUpdaterState, undefined, Error, Error>;
    receiveEventError: _moeru_eventa0.ReceiveEventError<AutoUpdaterState, undefined, Error, Error>;
    receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<AutoUpdaterState, undefined, Error, Error>;
  };
  quitAndInstall: {
    sendEvent: _moeru_eventa0.SendEvent<void, undefined, Error, Error>;
    sendEventError: _moeru_eventa0.SendEventError<void, undefined, Error, Error>;
    sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, undefined, Error, Error>;
    sendEventAbort: _moeru_eventa0.SendEventAbort<void, undefined, Error, Error>;
    receiveEvent: _moeru_eventa0.ReceiveEvent<void, undefined, Error, Error>;
    receiveEventError: _moeru_eventa0.ReceiveEventError<void, undefined, Error, Error>;
    receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, undefined, Error, Error>;
  };
};
//#endregion
export { AutoUpdaterError, AutoUpdaterProgress, AutoUpdaterState, AutoUpdaterStatus, autoUpdater, electronAutoUpdaterStateChanged };