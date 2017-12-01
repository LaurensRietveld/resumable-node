const path = require("path");
import * as express from "express";
import * as http from "http";
import * as fs from "fs-extra";
var multipart = require("connect-multiparty");
var crypto = require("crypto");
var server: http.Server;

export async function stop(config: Partial<Config> = {}) {
  if (config.tempDir) await fs.remove(config.tempDir);
  if (server)
    return new Promise<any>((resolve, reject) => {
      server.close(function() {
        resolve();
      });
    });
}
export interface Config {
  tempDir: string;
}
const defaultConfig: Config = {
  tempDir: "/tmp/resumable"
};
export default async function(_config: Partial<Config>) {
  const config = { ...defaultConfig, ..._config };
  await stop(config);
  await fs.remove(config.tempDir);
  await fs.mkdir(config.tempDir);
  return runServer(config);
}
export function runServer(config: Config) {
  const resumable = Resumable(config);
  var app = express();

  // Host most stuff in the public folder
  app.use(express.static(__dirname + "/public"));

  app.use(multipart());

  // Uncomment to allow CORS
  // app.use(function (req, res, next) {
  //    res.header('Access-Control-Allow-Origin', '*');
  //    next();
  // });

  // retrieve file id. invoke with /fileid?filename=my-file.jpg
  app.get("/fileid", function(req: any, res: any) {
    console.log("GETT");
    if (!req.query.filename) {
      return res.status(500).end("query parameter missing");
    }
    // create md5 hash from filename
    res.end(
      crypto
        .createHash("md5")
        .update(req.query.filename)
        .digest("hex")
    );
  });

  // Handle uploads through Resumable.js
  app.post("/upload", function(req: any, res: any) {
    resumable.post(req, function(status: any, filename: any, original_filename: any, identifier: any) {
      console.log("POST", status, original_filename, identifier);

      res.send(status);
    });
  });

  // Handle status checks on chunks through Resumable.js
  app.get("/upload", function(req: any, res: any) {
    resumable.get(req, function(status: any, filename: any, original_filename: any, identifier: any) {
      console.log("GET", status);
      res.status(status == "found" ? 200 : 404).send(status);
    });
  });

  app.get("/download/:identifier", function(req: any, res: any) {
    resumable.write(req.params.identifier, res);
  });
  app.get("/resumable.js", function(req: any, res: any) {
    var fs = require("fs");
    res.setHeader("content-type", "application/javascript");
    fs.createReadStream("../../resumable.js").pipe(res);
  });
  server = http.createServer(app);
  return new Promise<any>((resolve, reject) => {
    server.listen(3000, function() {
      resolve();
    });
  });
}

export function Resumable(this: any, config: Config) {
  var $: any = {};
  $.temporaryFolder = config.tempDir;
  $.maxFileSize = null;
  $.fileParameterName = "file";

  try {
    fs.mkdirSync($.temporaryFolder);
  } catch (e) {}

  var cleanIdentifier = function(identifier: any) {
    return identifier.replace(/^0-9A-Za-z_-/gim, "");
  };

  var getChunkFilename = function(chunkNumber: any, identifier: any) {
    // Clean up the identifier
    identifier = cleanIdentifier(identifier);
    // What would the file name be?
    return path.join($.temporaryFolder, "./resumable-" + identifier + "." + chunkNumber);
  };

  var validateRequest = function(
    chunkNumber: any,
    chunkSize: any,
    totalSize: any,
    identifier: any,
    filename: any,
    fileSize?: any
  ) {
    // Clean up the identifier
    identifier = cleanIdentifier(identifier);

    // Check if the request is sane
    if (chunkNumber == 0 || chunkSize == 0 || totalSize == 0 || identifier.length == 0 || filename.length == 0) {
      return "non_resumable_request";
    }
    var numberOfChunks = Math.max(Math.floor(totalSize / (chunkSize * 1.0)), 1);
    if (chunkNumber > numberOfChunks) {
      return "invalid_resumable_request1";
    }

    // Is the file too big?
    if ($.maxFileSize && totalSize > $.maxFileSize) {
      return "invalid_resumable_request2";
    }

    if (typeof fileSize != "undefined") {
      if (chunkNumber < numberOfChunks && fileSize != chunkSize) {
        // The chunk in the POST request isn't the correct size
        return "invalid_resumable_request3";
      }
      if (numberOfChunks > 1 && chunkNumber == numberOfChunks && fileSize != totalSize % chunkSize + chunkSize) {
        // The chunks in the POST is the last one, and the fil is not the correct size
        return "invalid_resumable_request4";
      }
      if (numberOfChunks == 1 && fileSize != totalSize) {
        // The file is only a single chunk, and the data size does not fit
        return "invalid_resumable_request5";
      }
    }

    return "valid";
  };

  //'found', filename, original_filename, identifier
  //'not_found', null, null, null
  $.get = function(req: express.Request, callback: any) {
    var chunkNumber = req.query["resumableChunkNumber"] || 0;
    var chunkSize = req.query["resumableChunkSize"] || 0;
    var totalSize = req.query["resumableTotalSize"] || 0;
    var identifier = req.query["resumableIdentifier"] || "";
    var filename = req.query["resumableFilename"] || "";
    if (validateRequest(chunkNumber, chunkSize, totalSize, identifier, filename) == "valid") {
      var chunkFilename = getChunkFilename(chunkNumber, identifier);
      fs.exists(chunkFilename, function(exists: any) {
        if (exists) {
          callback("found", chunkFilename, filename, identifier);
        } else {
          callback("not_found", null, null, null);
        }
      });
    } else {
      callback("not_found", null, null, null);
    }
  };

  //'partly_done', filename, original_filename, identifier
  //'done', filename, original_filename, identifier
  //'invalid_resumable_request', null, null, null
  //'non_resumable_request', null, null, null
  $.post = function(req: any, callback: any) {
    var fields = req.body;
    var files = req.files;

    var chunkNumber = fields["resumableChunkNumber"];
    var chunkSize = fields["resumableChunkSize"];
    var totalSize = fields["resumableTotalSize"];
    var identifier = cleanIdentifier(fields["resumableIdentifier"]);
    var filename = fields["resumableFilename"];

    var original_filename = fields["resumableIdentifier"];

    if (!files[$.fileParameterName] || !files[$.fileParameterName].size) {
      callback("invalid_resumable_request", null, null, null);
      return;
    }
    var validation = validateRequest(chunkNumber, chunkSize, totalSize, identifier, files[$.fileParameterName].size);
    if (validation == "valid") {
      var chunkFilename = getChunkFilename(chunkNumber, identifier);
      fs.renameSync(files[$.fileParameterName].path, chunkFilename);

      // Do we have all the chunks?
      var currentTestChunk = 1;
      var numberOfChunks = Math.max(Math.floor(totalSize / (chunkSize * 1.0)), 1);
      var testChunkExists = function() {
        var exists = fs.existsSync(getChunkFilename(currentTestChunk, identifier));
        if (exists) {
          currentTestChunk++;
          if (currentTestChunk > numberOfChunks) {
            callback("done", filename, original_filename, identifier);
          } else {
            // Recursion
            testChunkExists();
          }
        } else {
          callback("partly_done", filename, original_filename, identifier);
        }
      };
      testChunkExists();
      // });
    } else {
      callback(validation, filename, original_filename, identifier);
    }
  };

  // Pipe chunks directly in to an existsing WritableStream
  //   r.write(identifier, response);
  //   r.write(identifier, response, {end:false});
  //
  //   var stream = fs.createWriteStream(filename);
  //   r.write(identifier, stream);
  //   stream.on('data', function(data){...});
  //   stream.on('end', function(){...});
  $.write = function(identifier: any, writableStream: any, options: any) {
    options = options || {};
    options.end = typeof options["end"] == "undefined" ? true : options["end"];

    // Iterate over each chunk
    var pipeChunk = function(number: any) {
      var chunkFilename = getChunkFilename(number, identifier);
      fs.exists(chunkFilename, function(exists: any) {
        if (exists) {
          // If the chunk with the current number exists,
          // then create a ReadStream from the file
          // and pipe it to the specified writableStream.
          var sourceStream = fs.createReadStream(chunkFilename);
          sourceStream.pipe(writableStream, {
            end: false
          });
          sourceStream.on("end", function() {
            // When the chunk is fully streamed,
            // jump to the next one
            pipeChunk(number + 1);
          });
        } else {
          // When all the chunks have been piped, end the stream
          if (options.end) writableStream.end();
          if (options.onDone) options.onDone();
        }
      });
    };
    pipeChunk(1);
  };

  $.clean = function(identifier: any, options: any) {
    options = options || {};

    // Iterate over each chunk
    var pipeChunkRm = function(number: any) {
      var chunkFilename = getChunkFilename(number, identifier);

      //console.log('removing pipeChunkRm ', number, 'chunkFilename', chunkFilename);
      fs.exists(chunkFilename, function(exists: any) {
        if (exists) {
          console.log("exist removing ", chunkFilename);
          fs.unlink(chunkFilename, function(err: any) {
            if (err && options.onError) options.onError(err);
          });

          pipeChunkRm(number + 1);
        } else {
          if (options.onDone) options.onDone();
        }
      });
    };
    pipeChunkRm(1);
  };

  return $;
}
