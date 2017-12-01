This is a rough rewrite of resumable-JS. Most noticable changes:

- Written in typescript / es6
- Written for node-js. It won't work in the browser
- Using promises instead of callbacks
- Simple test suite (needs expanding though)

This is not meant as a replacement for resumable-js, nor is this meant for use in production infra. This lib misses some features of resumablejs, and it's purpose is mainly to upload files to a resumablejs backend from nodejs. Features such as preprocessing chunks, pausing, and others not fully tested, and probably wont work.

