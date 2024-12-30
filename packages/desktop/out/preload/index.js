'use strict'
const process = require('node:process')
const preload = require('@electron-toolkit/preload')
const electron = require('electron')

const api = {}
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld('electron', preload.electronAPI)
    electron.contextBridge.exposeInMainWorld('api', api)
  }
  catch (error) {
    console.error(error)
  }
}
else {
  window.electron = preload.electronAPI
  window.api = api
}
