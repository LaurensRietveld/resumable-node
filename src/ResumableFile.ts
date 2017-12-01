import { default as Resumable, FileInfo, RequestStatuses } from "./Resumable";
import ResumableChunk from "./ResumableChunk";
import { EventEmitter } from "events";
import * as fs from "fs-extra";
export default class ResumableFile extends EventEmitter {
  public stats: fs.Stats;
  public size: number;
  public filename: string;
  public identifier: string;
  private _pause = false;
  private _error = false;
  private prevProgress = 0;
  public chunks: ResumableChunk[] = [];
  private fileHandle: number;
  private resumable: Resumable;
  constructor(resumable: Resumable, fileInfo: FileInfo, identifier: string) {
    super();
    this.resumable = resumable;
    this.filename = fileInfo.filename;
    this.stats = fileInfo.info;
    this.size = fileInfo.info.size;
    this.identifier = identifier;

    // Bootstrap and return
    this.resumable.fire("chunkingStart", this);
    this.bootstrap();
  }

  public async getFileHandle(): Promise<number> {
    if (this.fileHandle !== undefined) return this.fileHandle;
    this.fileHandle = await fs.open(this.filename, "r");
    return this.fileHandle;
  }
  // public chunkEvent(event: "progress" | "success" | "error" | "retry", message: any) {
  //   switch (event) {
  //     case "progress":
  //       this.emit("fileProgress", message);
  //       break;
  //     case "error":
  //       this.abort();
  //       this._error = true;
  //       this.chunks = [];
  //       this.emit("fileError", message);
  //       break;
  //     case "success":
  //       if (this._error) return;
  //       this.emit("fileProgress", message); // it's at least progress
  //       if (this.isComplete()) {
  //         this.emit("fileSuccess", message);
  //       }
  //       break;
  //     case "retry":
  //       this.emit("fileRetry");
  //       break;
  //   }
  // }
  public abort() {
    // Stop current uploads
    var abortCount = 0;
    for (const chunk of this.chunks) {
      if (chunk.status() === RequestStatuses.UPLOADING) {
        chunk.abort();
        abortCount++;
      }
    }
    if (abortCount > 0) this.resumable.fire("fileProgress", this);
  }
  public cancel() {
    const _chunks = this.chunks;
    this.chunks = [];
    for (const chunk of _chunks) {
      if (chunk.status() === RequestStatuses.UPLOADING) {
        chunk.abort();
        this.resumable.uploadNextChunk();
      }
    }
  }

  public retry() {
    this.bootstrap();
    let firedRetry = false;
    this.resumable.on("chunkingComplete", () => {
      if (!firedRetry) this.resumable.upload();
      firedRetry = true;
    });
  }
  private bootstrap() {
    this.abort();
    this._error = false;
    // Rebuild stack of chunks from file
    this.chunks = [];
    this.prevProgress = 0;
    var maxOffset = Math.max(Math.floor(this.stats.size / this.resumable.conf.chunkSize), 1);
    for (let offset = 0; offset < maxOffset; offset++) {
      const chunk = new ResumableChunk(this.resumable, this, offset);
      chunk.on("progress", message => {
        this.resumable.fire("fileProgress", this, message);
      });
      chunk.on("error", message => {
        this.abort();
        this._error = true;
        this.chunks = [];
        this.resumable.fire("fileError", this, message);
      });
      chunk.on("success", message => {
        if (this._error) return;
        this.resumable.emit("fileProgress", this);
        if (this.isComplete()) {
          this.resumable.fire("fileSuccess", this, message);
        }
      });
      chunk.on("retry", () => {
        this.resumable.fire("fileRetry", this);
      });
      this.chunks.push(chunk);
      setImmediate(() => this.resumable.fire("chunkingProgress", this, offset / maxOffset));
    }
    setImmediate(() => this.resumable.fire("chunkingComplete", this));
  }

  public progress() {
    if (this._error) return 1;
    // Sum up progress across everything
    var ret = 0;
    var error = false;
    for (const chunk of this.chunks) {
      if (chunk.status() === RequestStatuses.ERROR) {
        error = true;
        ret += chunk.progress(true); // get chunk progress relative to entire file
      }
    }
    ret = error ? 1 : ret > 0.99999 ? 1 : ret;
    ret = Math.max(this.prevProgress, ret); // We don't want to lose percentages when an upload is paused
    this.prevProgress = ret;
    return ret;
  }

  isUploading() {
    for (const chunk of this.chunks) {
      if (chunk.status() === RequestStatuses.UPLOADING) {
        return true;
      }
    }
    return false;
  }

  isComplete() {
    for (const chunk of this.chunks) {
      var status = chunk.status();
      if (status !== RequestStatuses.SUCCESS) {
        return false;
      }
    }
    return true;
  }
  pause(pause: boolean) {
    if (pause === undefined) {
      this._pause = !!this._pause;
    } else {
      this._pause = pause;
    }
  }
  isPaused() {
    return this._pause;
  }
}
