import * as fs from "fs-extra";
import ResumableChunk from "./ResumableChunk";
import ResumableFile from "./ResumableFile";
import { EventEmitter } from "events";
export interface FileInfo {
  info: fs.Stats;
  filename: string;
}

export function wait(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}
export interface Config {
  /**
   * The target URL for the multipart POST request. This can be a string or a function that allows you you to construct and return a value, based on supplied params. (Default: /)
   **/
  target?: string;
  /**
   * The size in bytes of each uploaded chunk of data. The last uploaded chunk will be at least this size and up to two the size, see Issue #51 for details and reasons. (Default: 1*1024*1024)
   **/
  chunkSize?: number;
  /**
   * Number of simultaneous uploads (Default: 3)
   **/
  simultaneousUploads?: number;
  /**
   * The name of the multipart POST parameter to use for the file chunk (Default: file)
   **/
  fileParameterName?: string;
  /**
   * The name of the chunk index (base-1) in the current upload POST parameter to use for the file chunk (Default: resumableChunkNumber)
   */
  chunkNumberParameterName?: string;
  /**
   * The name of the total number of chunks POST parameter to use for the file chunk (Default: resumableTotalChunks)
   */
  totalChunksParameterName?: string;
  /**
   * The name of the general chunk size POST parameter to use for the file chunk (Default: resumableChunkSize)
   */
  chunkSizeParameterName?: string;
  /**
   * The name of the total file size number POST parameter to use for the file chunk (Default: resumableTotalSize)
   */
  totalSizeParameterName?: string;
  /**
   * The name of the unique identifier POST parameter to use for the file chunk (Default: resumableIdentifier)
   */
  identifierParameterName?: string;
  /**
   * The name of the original file name POST parameter to use for the file chunk (Default: resumableFilename)
   */
  fileNameParameterName?: string;
  /**
   * The name of the file's relative path POST parameter to use for the file chunk (Default: resumableRelativePath)
   */
  relativePathParameterName?: string;
  /**
   * The name of the current chunk size POST parameter to use for the file chunk (Default: resumableCurrentChunkSize)
   */
  currentChunkSizeParameterName?: string;
  /**
   * The name of the file type POST parameter to use for the file chunk (Default: resumableType)
   */
  typeParameterName?: string;
  /**
   * Extra parameters to include in the multipart POST with data. This can be an object or a function. If a function, it will be passed a ResumableFile and a ResumableChunk object (Default: {})
   **/
  query?: Object;
  /**
   * Method for chunk test request. (Default: 'GET')
   **/
  testMethod?: string;
  /**
   * Method for chunk upload request. (Default: 'POST')
   **/
  uploadMethod?: string;
  /**
   * Extra prefix added before the name of each parameter included in the multipart POST or in the test GET. (Default: '')
   **/
  parameterNamespace?: string;
  /**
   * Extra headers to include in the multipart POST with data. This can be an object or a function that allows you to construct and return a value, based on supplied file (Default: {})
   **/
  headers?: { [key: string]: string } | ((file: ResumableFile) => { [key: string]: string });
  /**
   * Method to use when POSTing chunks to the server (multipart or octet) (Default: multipart)
   **/
  method?: string;
  /**
   * Make a GET request to the server for each chunks to see if it already exists. If implemented on the server-side, this will allow for upload resumes even after a browser crash or even a computer restart. (Default: true)
   **/
  testChunks?: boolean;
  /**
   * Optional function to process each chunk before testing & sending. Function is passed the chunk as parameter, and should call the preprocessFinished method on the chunk when finished. (Default: null)
   **/
  preprocess?: (chunk: ResumableChunk) => ResumableChunk;
  /**
   * Override the function that generates unique identifiers for each file. (Default: null)
   **/
  generateUniqueIdentifier?: () => string;
  /**
   * Indicates how many files can be uploaded in a single session. Valid values are any positive integer and undefined for no limit. (Default: undefined)
   **/
  maxFiles?: number;
  /**
   * A function which displays the please upload n file(s) at a time message. (Default: displays an alert box with the message Please n one file(s) at a time.)
   **/
  maxFilesErrorCallback?: (files: ResumableFile, errorCount: number) => void;
  /**
   * The minimum allowed file size. (Default: undefined)
   **/
  minFileSize?: number;
  /**
   * A function which displays an error a selected file is smaller than allowed. (Default: displays an alert for every bad file.)
   **/
  minFileSizeErrorCallback?: (file: ResumableFile, errorCount: number) => void;
  /**
   * The maximum allowed file size. (Default: undefined)
   **/
  maxFileSize?: number;
  /**
   * A function which displays an error a selected file is larger than allowed. (Default: displays an alert for every bad file.)
   **/
  maxFileSizeErrorCallback?: (file: ResumableFile, errorCount: number) => void;
  /**
   * The file types allowed to upload. An empty array allow any file type. (Default: [])
   **/
  fileType?: string[];
  /**
   * A function which displays an error a selected file has type not allowed. (Default: displays an alert for every bad file.)
   **/
  fileTypeErrorCallback?: (file: ResumableFile, errorCount: number) => void;
  /**
   * The maximum number of retries for a chunk before the upload is failed. Valid values are any positive integer and undefined for no limit. (Default: undefined)
   **/
  maxChunkRetries?: number;
  /**
   * The number of milliseconds to wait before retrying a chunk on a non-permanent error. Valid values are any positive integer and undefined for immediate retry. (Default: undefined)
   **/
  chunkRetryInterval?: number;
  throttleProgressCallbacks?: number;
  testTarget?: string;
  permanentErrors?: number[];
  xhrTimeout?: number;
}
const defaultConfig: Config = {
  chunkSize: 1 * 1024 * 1024,
  simultaneousUploads: 3,
  fileParameterName: "file",
  chunkNumberParameterName: "resumableChunkNumber",
  chunkSizeParameterName: "resumableChunkSize",
  currentChunkSizeParameterName: "resumableCurrentChunkSize",
  totalSizeParameterName: "resumableTotalSize",
  typeParameterName: "resumableType",
  identifierParameterName: "resumableIdentifier",
  fileNameParameterName: "resumableFilename",
  relativePathParameterName: "resumableRelativePath",
  totalChunksParameterName: "resumableTotalChunks",
  throttleProgressCallbacks: 0.5,
  query: {},
  headers: {},
  preprocess: null,
  method: "multipart",
  uploadMethod: "POST",
  testMethod: "GET",
  target: "/",
  testTarget: null,
  parameterNamespace: "",
  testChunks: true,
  generateUniqueIdentifier: null,
  maxChunkRetries: 100,
  chunkRetryInterval: undefined,
  permanentErrors: [400, 404, 415, 500, 501],
  maxFiles: undefined,
  xhrTimeout: 0,
  minFileSize: 1,
  maxFileSize: undefined,
  fileType: []
};

export enum RequestStatuses {
  PENDING = "pending",
  UPLOADING = "uplading",
  SUCCESS = "success",
  ERROR = "error"
}

export interface Resumable {
  on(event: "fileSuccess", listener: (file: ResumableFile, message: string) => void): this;
  on(event: "fileProgress", listener: (file: ResumableFile) => void): this;
  on(event: "fileAdded", listener: (file: ResumableFile) => void): this;
  on(event: "filesAdded", listener: (filesAdded: ResumableFile[], filesSkipped: string[]) => void): this;
  on(event: "fileRetry", listener: (file: ResumableFile) => void): this;
  on(event: "fileError", listener: (file: ResumableFile, message: string) => void): this;
  on(event: "uploadStart", listener: () => void): this;
  on(event: "complete", listener: () => void): this;
  on(event: "progress", listener: () => void): this;
  on(event: "error", listener: (message: string, file: ResumableFile) => void): this;
  on(event: "pause", listener: () => void): this;
  on(event: "beforeCancel", listener: () => void): this;
  on(event: "cancel", listener: () => void): this;
  on(event: "chunkingStart", listener: (file: ResumableFile) => void): this;
  on(event: "chunkingProgress", listener: (file: ResumableFile, ratio: number) => void): this;
  on(event: "chunkingComplete", listener: (file: ResumableFile) => void): this;
  on(event: string, listener: Function): this;
}

export class Resumable extends EventEmitter {
  public conf: Config;
  private files: ResumableFile[] = [];
  constructor(config: Config = {}) {
    super();
    this.conf = { ...defaultConfig, ...config };
  }
  private async getFileInfo(file: string): Promise<FileInfo> {
    const statResult = await fs.stat(file);
    return {
      info: statResult,
      filename: file
    };
  }
  private generateUniqueIdentifier(file: FileInfo) {
    // var custom = this.getOpt('generateUniqueIdentifier');
    // if(typeof custom === 'function') {
    //   return custom(file, event);
    // }
    // var relativePath = file.webkitRelativePath||file.fileName||file.name; // Some confusion in different versions of Firefox
    var size = file.info.size;
    return size + "-" + file.filename.replace(/[^0-9a-zA-Z_-]/gim, "");
  }

  public fire(event: string, ...args: any[]) {
    this.emit(event, ...args);
    if (event == "fileError") this.fire("error", args[1], args[0]);
    if (event == "fileProgress") this.fire("progress");
  }

  private async appendFilesFromFileList(fileList: string[]) {
    const { maxFiles, minFileSize, maxFileSize } = this.conf;
    if (maxFiles !== undefined && maxFiles < fileList.length + this.files.length) {
      throw new Error("Sending too many files");
    }

    var files: ResumableFile[] = [],
      filesSkipped: string[] = [],
      remaining = fileList.length;
    var decreaseReamining = () => {
      if (!--remaining) {
        // all files processed, trigger event
        if (!files.length && !filesSkipped.length) {
          // no succeeded files, just skip
          return;
        }
        this.fire("filesAdded", files, filesSkipped);
      }
    };
    for (const file of fileList) {
      const fileInfo = await this.getFileInfo(file);
      if (minFileSize !== undefined && fileInfo.info.size < minFileSize) {
        throw new Error("File size less than minfilesize");
      }
      if (maxFileSize !== undefined && fileInfo.info.size > maxFileSize) {
        throw new Error("File size too large");
      }
      var uniqueIdentifier = this.generateUniqueIdentifier(fileInfo);
      if (!this.getFromUniqueIdentifier(uniqueIdentifier)) {
        // file.uniqueIdentifier = uniqueIdentifier;
        var f = new ResumableFile(this, fileInfo, uniqueIdentifier);
        this.files.push(f);
        files.push(f);
        this.fire("fileAdded", f);
      } else {
        //already in file list
        filesSkipped.push(file);
      }
      decreaseReamining();
    }
  }

  async uploadNextChunk(): Promise<any> {
    // Now, simply look for the next, best thing to upload
    for (const file of this.files) {
      if (file.isPaused() === false) {
        for (const chunk of file.chunks) {
          if (chunk.status() === RequestStatuses.PENDING) {
            return chunk.send();
          }
        }
      }
    }
    // The are no more outstanding chunks to upload, check is everything is done
    var allDone = true;
    for (const file of this.files) {
      if (!file.isComplete()) {
        allDone = false;
        break;
      }
    }
    if (allDone) {
      this.fire("complete");
      return true;
    }
    return false;
  }
  isUploading() {
    return this.files.find(f => f.isUploading());
  }
  upload(): Promise<any> {
    // Make sure we don't start too many uploads at once
    if (this.isUploading()) return;
    // Kick off the queue
    this.fire("uploadStart");

    const promises: Promise<any>[] = [];
    for (let num = 1; num <= this.conf.simultaneousUploads; num++) {
      promises.push(this.uploadNextChunk());
    }
    return Promise.all(promises);
  }
  pause() {
    // Resume all chunks currently being uploaded
    this.files.forEach(f => f.abort());
    this.fire("pause");
  }
  cancel() {
    this.fire("beforeCancel");
    this.files.forEach(f => f.cancel());
    this.fire("cancel");
  }
  progress() {
    var totalDone = 0;
    var totalSize = 0;
    for (const file of this.files) {
      totalDone += file.progress() * file.size;
      totalSize += file.size;
    }
    return totalSize > 0 ? totalDone / totalSize : 0;
  }
  addFile(filename: string) {
    return this.appendFilesFromFileList([filename]);
  }
  addFiles(files: string[]) {
    return this.appendFilesFromFileList(files);
  }
  removeFilefunction(file: ResumableFile) {
    for (var i = this.files.length - 1; i >= 0; i--) {
      if (this.files[i] === file) {
        this.files.splice(i, 1);
      }
    }
  }
  getFromUniqueIdentifier(uniqueIdentifier: string) {
    return this.files.find(f => f.identifier === uniqueIdentifier);
  }

  getSize() {
    return this.files.reduce((sum, file) => {
      return (sum += file.size);
    }, 0);
  }
}
export default Resumable;
