const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('hephaestus', {
  backendPort: process.env.HEPH_PORT || '8155',
  platform: process.platform,
})
