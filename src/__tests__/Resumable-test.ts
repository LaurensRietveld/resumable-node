import Resumable from "../Resumable";
import { default as ResumableServer, stop, Config } from "./ResumableServer";
import * as fs from "fs-extra";
const uploadTarget = "http://localhost:3000/upload";
const testTarget = "http://localhost:3000/fileid";
const resumableServerConf: Partial<Config> = {
  tempDir: __dirname + "/serverAssets"
};
import * as chai from "chai";
// import * as _ from "lodash";
const expect = chai.expect;
const tmpDir = __dirname + "/tmp";

describe.only("Resumable", function() {
  before(async function() {
    await fs.remove(tmpDir);
    await fs.mkdir(tmpDir);
    return ResumableServer(resumableServerConf);
  });
  beforeEach(async function() {
    //clear resumable tmp dir
    await fs.remove(resumableServerConf.tempDir);
    await fs.mkdir(resumableServerConf.tempDir);
  });
  after(function() {
    // return stop(resumableServerConf);
    return stop();
  });
  it("Add file that doesnt exist", async function() {
    var r = new Resumable({
      target: uploadTarget,
      testTarget: testTarget
    });
    try {
      await r.addFile("bla");
    } catch (e) {
      //great, an error
      return;
    }
    throw new Error("Expected an err");
  });
  describe("One file that exists", function() {
    const testFile = __dirname + "/testFile.txt";
    before(async function() {
      // await fs.writeFile(testFile, new Buffer(1000));
      // await fs.writeFile(testFile, fileContent);
      // await fs.writeFile(testFile, new Buffer(1000));
    });

    it("Should be added in one chunk", async function() {
      var r = new Resumable({
        target: uploadTarget
      });

      await r.addFile(testFile);
      expect(r.getSize()).to.equal(1047);
      await r.upload();
    });
    it.only("Should be added in multiple chunks", async function() {
      var r = new Resumable({
        target: uploadTarget,
        chunkSize: 122
      });
      var completedEvents = 0;
      await r.addFile(testFile);
      expect(r.getSize()).to.equal(1047);
      // r.on('hello', (name) => {})
      r.on("complete", () => {
        console.log("complete?");
        completedEvents++;
      });
      var err: any;
      r.on("error", function(msg, file) {
        err = { msg, file };
      });
      // r.on("chunkingComplete", () => {
      //   chunkCompleteEvents++;
      // });

      await r.upload();
      if (err) {
        throw new Error("Unexpected error emitted");
      }
      // expect(chunkCompleteEvents).to.equal(8);
      expect(completedEvents).to.equal(1);
    });
  });
});
function logEvents(resumable: Resumable, ...events: string[]) {
  for (const event of events) {
    resumable.on(event, () => {
      console.log("got event " + event);
    });
  }
}
