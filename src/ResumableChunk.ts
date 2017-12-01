import * as superagent from "superagent";
import { EventEmitter } from "events";
import { default as Resumable, wait, RequestStatuses } from "./Resumable";
import * as fs from "fs-extra";
import ResumableFile from "./ResumableFile";
export default class ResumableChunk extends EventEmitter {
  private resumable: Resumable;
  private file: ResumableFile;
  private offset: number;
  // private callback:any;
  private tested = false;
  private lastProgressCallback = Date.now();
  private retries = 0;
  private pendingRetry = false;
  // this.preprocessState = 0; // 0 = unprocessed, 1 = processing, 2 = finished
  //
  private req: superagent.SuperAgentRequest;
  private res: superagent.Response;
  // // Computed properties
  // var chunkSize = this.getOpt('chunkSize');
  private fileObjSize: number;
  private chunkSize: number;
  private startByte: number;
  private endByte: number;
  private loaded = 0; //number of bytes uploaded so far
  constructor(resumable: Resumable, resumableFile: ResumableFile, offset: number) {
    super();
    this.resumable = resumable;
    this.file = resumableFile;
    this.offset = offset;
    this.computeProps();
  }
  private computeProps() {
    this.fileObjSize = this.file.size;
    this.chunkSize = this.resumable.conf.chunkSize;
    this.startByte = this.offset * this.chunkSize;
    this.endByte = Math.min(this.fileObjSize, (this.offset + 1) * this.chunkSize);
    if (this.fileObjSize - this.endByte < this.chunkSize) {
      // The last chunk will be bigger than the chunk size, but less than 2*chunkSize
      this.endByte = this.fileObjSize;
    }
  }
  // test() makes a GET request without any data to see if the chunk has already been uploaded in a previous session
  public async test() {
    this.req = superagent.get(this.resumable.conf.testTarget || this.resumable.conf.target);
    if (this.resumable.conf.xhrTimeout) this.req.timeout(this.resumable.conf.xhrTimeout);
    this.req.query({
      [this.resumable.conf.chunkNumberParameterName]: this.offset + 1,
      [this.resumable.conf.chunkSizeParameterName]: this.resumable.conf.chunkSize,
      [this.resumable.conf.currentChunkSizeParameterName]: this.endByte - this.startByte,
      [this.resumable.conf.totalSizeParameterName]: this.fileObjSize,
      // [this.resumable.conf.typeParameterName]: this.fileObjType,
      [this.resumable.conf.identifierParameterName]: this.file.identifier,
      [this.resumable.conf.fileNameParameterName]: this.file.filename,
      // [this.resumable.conf.relativePathParameterName]: this.file.relativePath,
      [this.resumable.conf.totalChunksParameterName]: this.file.chunks.length
    });
    if (this.resumable.conf.headers) {
      var headers: { [key: string]: string } = {};
      if (typeof this.resumable.conf.headers === "function") {
        headers = this.resumable.conf.headers(this.file);
      } else {
        headers = this.resumable.conf.headers;
      }
      Object.keys(headers).forEach(k => {
        this.req.set(k, headers[k]);
      });
    }
    // this.requestPending = true;
    this.res = await this.req.then(res => res, res => res);
    this.tested = true;
    if (this.status() === RequestStatuses.SUCCESS) {
      this.emit("success", this.message());
      return this.resumable.uploadNextChunk();
    } else {
      return this.send();
    }
  }

  public status(): RequestStatuses {
    if (this.pendingRetry) {
      // if pending retry then that's effectively the same as actively uploading,
      // there might just be a slight delay before the retry starts
      return RequestStatuses.UPLOADING;
    }
    if (!this.req) return RequestStatuses.PENDING;
    if (this.req && !this.res) return RequestStatuses.UPLOADING;
    if (this.res && (this.res.status === 200 || this.res.status === 201)) return RequestStatuses.SUCCESS;
    if (
      this.resumable.conf.permanentErrors.indexOf(this.res.status) >= 0 ||
      this.retries >= this.resumable.conf.maxChunkRetries
    ) {
      return RequestStatuses.ERROR;
    }
    // this should never happen, but we'll reset and queue a retry
    // a likely case for this would be 503 service unavailable
    this.abort();
    return RequestStatuses.PENDING;
  }
  public abort() {
    // Abort and reset
    if (this.req) this.req.abort();
    this.req = null;
  }
  private message() {
    return this.res ? this.res.text : "";
  }

  public async send(): Promise<any> {
    if (this.resumable.conf.testChunks && !this.tested) {
      return this.test();
    }
    this.req = superagent.post(this.resumable.conf.target);
    this.req.on("progress", p => {
      const d = Date.now();
      if (d - this.lastProgressCallback > this.resumable.conf.throttleProgressCallbacks * 1000) {
        this.emit("progress");
        this.lastProgressCallback = d;
      }
      this.loaded = p.loaded || 0;
    });
    this.loaded = 0;
    this.pendingRetry = false;
    this.emit("progress");

    // this.req.set("Content-Type", "application/octet-stream");
    this.req.timeout(this.resumable.conf.xhrTimeout);
    // Add data from header options
    if (this.resumable.conf.headers) {
      var headers: { [key: string]: string } = {};
      if (typeof this.resumable.conf.headers === "function") {
        headers = this.resumable.conf.headers(this.file);
      } else {
        headers = this.resumable.conf.headers;
      }
      Object.keys(headers).forEach(k => {
        this.req.set(k, headers[k]);
      });
    }

    const buffer = new Buffer(this.endByte - this.startByte);
    const readResults = await fs.read(await this.file.getFileHandle(), buffer, 0, buffer.length, this.startByte);
    const bytes = readResults.buffer;
    const args = {
      [this.resumable.conf.chunkNumberParameterName]: this.offset + 1,
      [this.resumable.conf.chunkSizeParameterName]: this.resumable.conf.chunkSize,
      [this.resumable.conf.currentChunkSizeParameterName]: this.endByte - this.startByte,
      [this.resumable.conf.totalSizeParameterName]: this.file.size,
      // [this.resumable.conf.typeParameterName]: this.fileObjType]
      [this.resumable.conf.identifierParameterName]: this.file.identifier,
      [this.resumable.conf.fileNameParameterName]: this.file.filename,
      // [this.resumable.conf.relativePathParameterName]: this.file.relativePath,
      [this.resumable.conf.totalChunksParameterName]: this.file.chunks.length
    };
    for (let i in args) {
      this.req.field(i, args[i]);
    }
    this.res = await this.req.attach(this.resumable.conf.fileParameterName, bytes, "application/octet-stream");
    var status = this.status();
    if (status === RequestStatuses.ERROR || status == RequestStatuses.SUCCESS) {
      this.emit(status === RequestStatuses.ERROR ? "error" : "success", this.message());
      return this.resumable.uploadNextChunk();
    } else {
      this.emit("retry", this.message());
      this.abort();
      this.retries++;
      var retryInterval = this.resumable.conf.chunkRetryInterval;
      if (retryInterval !== undefined) {
        this.pendingRetry = true;
        await wait(retryInterval);
        return this.send();
      } else {
        return this.send();
      }
    }
  }
  progress(relative: boolean = false) {
    var factor = relative ? (this.endByte - this.startByte) / this.fileObjSize : 1;
    if (this.pendingRetry) return 0;
    if (!this.res || !this.res.status) factor *= 0.95;
    switch (this.status()) {
      case RequestStatuses.SUCCESS:
      case RequestStatuses.ERROR:
        return 1 * factor;
      case RequestStatuses.PENDING:
        return 0;
      default:
        return this.loaded / (this.endByte - this.startByte) * factor;
    }
  }
}
