const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { SerialPort } = require('serialport');
const { autoUpdater } = require('electron-updater');

let mainWindow, port, state;
const configFile = () => path.join(app.getPath('userData'), 'lumen-config.json');
const defaultState = {
  fixtures: [
    { id:'moving-e', name:'Moving esquerdo', address:1, channels:14, type:'moving' },
    { id:'moving-d', name:'Moving direito', address:15, channels:14, type:'moving' },
    { id:'ribal-1', name:'Ribalta 1', address:29, channels:4, type:'bar' },
    { id:'ribal-2', name:'Ribalta 2', address:33, channels:4, type:'bar' },
    { id:'par-1', name:'PAR LEDs', address:37, channels:6, type:'par', quantity:4 }
  ],
  scenes: [
    { id:'warm', name:'Palco quente', color:'#ffb44d', channels:{1:0,2:0,3:0} },
    { id:'blue', name:'Azul ambiente', color:'#4d9bff', channels:{} },
    { id:'praise', name:'Celebração', color:'#b667ff', channels:{} },
    { id:'prayer', name:'Oração', color:'#ad86ff', channels:{} }
  ],
  sequences: [{ id:'culto', name:'Culto de celebração', steps:[{sceneId:'warm', hold:720},{sceneId:'blue', hold:1080},{sceneId:'praise', hold:1800},{sceneId:'prayer', hold:600}] }],
  connection: { path:'', universe:1 }
};
function loadState(){ try { return JSON.parse(fs.readFileSync(configFile(),'utf8')); } catch { return structuredClone(defaultState); } }
function saveState(){ fs.mkdirSync(path.dirname(configFile()),{recursive:true}); fs.writeFileSync(configFile(),JSON.stringify(state,null,2)); }
function sendStatus(status, details=''){ mainWindow?.webContents.send('dmx-status',{status,details}); }
async function listPorts(){ return (await SerialPort.list()).map(p=>({path:p.path,label:[p.friendlyName,p.manufacturer,p.serialNumber].filter(Boolean).join(' · ') || p.path})); }
async function connectDMX(devicePath){
  if(port?.isOpen) await new Promise(r=>port.close(r));
  port = new SerialPort({ path:devicePath, baudRate:250000, dataBits:8, stopBits:2, parity:'none', autoOpen:false });
  await new Promise((resolve,reject)=>port.open(err=>err?reject(err):resolve()));
  state.connection.path=devicePath; saveState(); sendStatus('connected', devicePath);
  return true;
}
function writeUniverse(changes={}){
  if(!port?.isOpen) throw new Error('Interface DMX não está conectada');
  const frame=Buffer.alloc(513,0); Object.entries(changes).forEach(([channel,value])=>{ const n=Number(channel); if(n>=1&&n<=512) frame[n]=Math.max(0,Math.min(255,Number(value)||0)); });
  // ENTTEC Open DMX: 1 start-code + 512 canais, 250 kbaud, 8N2.
  port.write(frame); port.drain();
}
function createWindow(){ mainWindow=new BrowserWindow({width:1280,height:820,minWidth:980,minHeight:650,backgroundColor:'#080a11',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}}); mainWindow.loadFile(path.join(__dirname,'renderer','index.html')); }
app.whenReady().then(()=>{ state=loadState(); createWindow(); autoUpdater.autoDownload=false; autoUpdater.on('update-available',info=>mainWindow.webContents.send('update-available',info.version)); autoUpdater.on('error',err=>mainWindow.webContents.send('update-error',err.message)); autoUpdater.on('update-downloaded',()=>{sendStatus('updating','Reiniciando para concluir a atualização'); autoUpdater.quitAndInstall();}); });
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit()});
ipcMain.handle('state:get',()=>state);
ipcMain.handle('state:save',(_,next)=>{state=next;saveState();return state});
ipcMain.handle('ports:list',listPorts);
ipcMain.handle('dmx:connect',async(_,p)=>{try{return await connectDMX(p)}catch(e){sendStatus('error',e.message);throw e}});
ipcMain.handle('dmx:scene',(_,scene)=>writeUniverse(scene.channels));
ipcMain.handle('dmx:blackout',()=>writeUniverse({}));
ipcMain.handle('config:export',async()=>{const r=await dialog.showSaveDialog(mainWindow,{title:'Exportar configurações Lumen',defaultPath:'lumen-config.json',filters:[{name:'Lumen JSON',extensions:['json']}]});if(!r.canceled){fs.writeFileSync(r.filePath,JSON.stringify(state,null,2));return r.filePath}});
ipcMain.handle('config:import',async()=>{const r=await dialog.showOpenDialog(mainWindow,{title:'Importar configurações Lumen',properties:['openFile'],filters:[{name:'Lumen JSON',extensions:['json']}]});if(!r.canceled){state=JSON.parse(fs.readFileSync(r.filePaths[0],'utf8'));saveState();return state}});
ipcMain.handle('update:check',async()=>{try{const result=await autoUpdater.checkForUpdates();return result?.updateInfo?.version||null}catch(e){throw new Error('Não foi possível buscar atualizações: '+e.message)}});
ipcMain.handle('update:install',()=>autoUpdater.downloadUpdate());
ipcMain.handle('external:releases',()=>shell.openExternal('https://github.com/psilaslis-ship-it/CPJCL/releases'));
