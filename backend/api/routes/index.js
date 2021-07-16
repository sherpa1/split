const express = require('express');
const router = express.Router();

const multer = require('multer');

const pdftk = require('node-pdftk');

const fsp = require('fs').promises;
const fs = require('fs');

const del = require("del");

const archiver = require('archiver');

const path = require('path');


const MIME_TYPES = {
  'application/pdf': 'pdf'
};

const filefilter = (req, file, cb) => {
  if (
    file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads')
  },
  filename: (req, file, cb) => {
    const name = file.originalname.split(' ').join('_');
    const extension = MIME_TYPES[file.mimetype];
    cb(null, Date.now() + "." + extension)
  }
});

const upload = multer({ storage: storage, fileFilter: filefilter });

router.get('/', (req, res, next) => {
  return res.status(200).json({ message: `Welcome to Split API` });
});

router.post('/', upload.single('pdf_file'), async (req, res, next) => {

  if (!req.file) {
    const error = new Error('Please upload a pdf file');
    error.httpStatusCode = 400;
    return next(error);
  }

  const file_path = req.file.path;

  const timestamp = Date.now();


  let splits_dir_exists;

  const archive_filename = "archive.zip";
  const root_path = "/app/api";

  const public_path = '/public';
  const uploads_path = public_path + "/uploads";

  const splits_path = '.' + public_path + '/splits';

  const dir_path = splits_path + '/' + timestamp;

  try {
    await fsp.access(splits_path);
    splits_dir_exists = true;
  } catch (error) {
    splits_dir_exists = false;
  }

  if (splits_dir_exists) {
    //remove old splitted pdf files
    try {
      await del(splits_path);
    } catch (error) {
      return res.status(500).json({ message: error });
    }

  }

  try {
    await fsp.mkdir(splits_path);
  } catch (error) {
    return res.status(500).json({ message: error });
  }

  //check if uploaded pdf file exists
  try {
    await fsp.access(file_path);
  } catch (error) {
    return res.status(500).json({ message: 'pdf file has not been uploaded' });
  }

  //make dir where to place the splitted files from uploaded pdf file
  try {
    await fsp.mkdir(dir_path);
  } catch (error) {
    return res.status(500).json({ message: error });
  }

  //split uploaded pdf file in separated pdf files
  try {
    await pdftk
      .input(file_path)
      .burst(dir_path + '/doc_%02d.pdf');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error });
  }

  try {
    fsp.unlink(dir_path + '/doc_data.txt');//we don't need this file into the archive
  } catch (error) {
    return res.status(500).json({ message: error });
  }

  const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  });

  const output = fs.createWriteStream(root_path + public_path + "/" + archive_filename);


  // listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  output.on('close', () => {
    //console.log(archive.pointer() + ' total bytes');
    //console.log('archiver has been finalized and the output file descriptor has closed.');

    const options = {
      root: path.join(root_path, 'public'),
      dotfiles: 'deny',
      headers: {
        'x-timestamp': Date.now(),
        'x-sent': true
      }
    }

    return res.status(201).sendFile(archive_filename, options);

    // fs.unlink(path.join(root_path + public_path, archive_filename), err => {
    //   if (err) throw err;
    // });

  });

  // This event is fired when the data source is drained no matter what was the data source.
  // It is not part of this library but rather from the NodeJS Stream API.
  // @see: https://nodejs.org/api/stream.html#stream_event_end
  output.on('end', () => {
    console.log('Data has been drained');

  });

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      // log warning
      console.warn(err);
    } else {
      console.error(err);
      // throw error
      throw err;
    }
  });

  // good practice to catch this error explicitly
  archive.on('error', (err) => {
    throw err;
  });

  // pipe archive data to the file
  archive.pipe(output);

  try {
    archive.directory(dir_path, false);
  } catch (error) {
    return res.status(500).json({ message: error });
  }

  let zip_file;

  try {
    zip_file = archive.finalize();
  } catch (error) {
    return res.status(500).json({ message: error });
  }

  fs.readdir(root_path + uploads_path, (err, files) => {
    if (err) throw err;

    for (const file of files) {
      fs.unlink(path.join(root_path + uploads_path, file), err => {
        if (err) throw err;
      });
    }
  });




});

module.exports = router;
