const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class DmxOutput {
  constructor(onState) {
    this.onState = onState;
    this.port = null;
    this.writer = null;
    this.active = false;
    this.frame = new Uint8Array(513);
    this.loop = null;
    this.stopBits = 2;
    navigator.serial?.addEventListener('disconnect', event => {
      if (event.target === this.port) this.disconnect().catch(() => {});
    });
  }

  get connected() { return this.active && Boolean(this.port); }

  async connect() {
    if (!navigator.serial) throw new Error('Abra o Lumen no Microsoft Edge ou Google Chrome para usar a interface USB.');
    if (this.connected) return;
    // The chooser requires a user click. The Windows dialog should show the
    // FTDI USB Serial Port (COM17 on the current computer).
    const port = await navigator.serial.requestPort();
    let stopBits = 2;
    try {
      await port.open({ baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none', flowControl: 'none' });
    } catch (firstError) {
      try {
        await port.open({ baudRate: 250000, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
        stopBits = 1;
      } catch (secondError) {
        throw new Error(`Não foi possível abrir a porta. Feche o FreeStyler e confira o driver. ${secondError.message}`);
      }
    }
    this.port = port;
    this.stopBits = stopBits;
    this.writer = port.writable.getWriter();
    this.active = true;
    this.frame.fill(0);
    this.onState({ connected: true, stopBits, info: port.getInfo() });
    this.loop = this.pump();
  }

  setChannels(channels = {}) {
    this.frame.fill(0);
    for (const [address, raw] of Object.entries(channels)) {
      const channel = Number(address);
      if (Number.isInteger(channel) && channel >= 1 && channel <= 512)
        this.frame[channel] = Math.max(0, Math.min(255, Number(raw) || 0));
    }
  }

  async sendFrame() {
    // Open DMX has no processor in the adapter: every frame needs BREAK,
    // mark-after-break, start code 0, then the 512 channel values.
    await this.port.setSignals({ break: true });
    await sleep(1);
    await this.port.setSignals({ break: false });
    await sleep(1);
    await this.writer.write(this.frame);
  }

  async pump() {
    try {
      while (this.active) {
        const started = performance.now();
        await this.sendFrame();
        await sleep(Math.max(0, 40 - (performance.now() - started)));
      }
    } catch (error) {
      this.active = false;
      try { this.writer?.releaseLock(); } catch {}
      try { await this.port?.close(); } catch {}
      this.writer = null;
      this.port = null;
      this.loop = null;
      this.onState({ connected: false, error: `Falha na transmissão DMX: ${error.message}` });
    }
  }

  async disconnect() {
    if (!this.port) return;
    this.active = false;
    try { await this.loop; } catch {}
    this.frame.fill(0);
    try { await this.sendFrame(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port.close(); } catch {}
    this.writer = null;
    this.port = null;
    this.loop = null;
    this.onState({ connected: false });
  }
}
