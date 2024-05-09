import fileUpload from "express-fileupload";
import status from "express-status-monitor";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import express from "express";
import cors from "cors";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url); // For getting current file path
const __dirname = dirname(__filename); // For getting current directory

const app = express(); // Instance of express
app.use(status()); // Middleware for status monitoring
app.use(
  // Middleware for CORS
  cors({
    origin: "http://localhost:3000", // Accepts request only from this origin
  })
);
app.use(express.json()); // Middleware for parsing JSON responses
app.use(express.urlencoded({ extended: true }));




//––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//–––––––––––––– Route for uploading file in One Shot ––––––––––––––
app.post("/upload", fileUpload({ createParentPath: true }), (req, res) => {
  const {
    files,
    body: { originalName },
  } = req;

  if (!files) {
    return res
      .status(400)
      .send({ status: "Failed", message: "No file received!" });
  }

  const fileName = files.file.name;
  const fileLocation = path.join(__dirname, "files", originalName || fileName);

  fs.writeFile(fileLocation, files.file.data, (err) => {
    if (err) {
      console.log(`Error writing file: ${fileLocation}, Error: ${err.message}`);
      return res.send({ status: "Failed", message: err.message });
    }
    console.log(`The file is saved to: ${fileLocation}`);
  });

  return res.send({
    status: "Success",
    message: "The File is uploaded successfully.",
    fileLocation,
  });
});


//––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//––––––––––––––– Route for uploading file in chunks –––––––––––––––
app.post(
  "/upload/chunk",
  fileUpload({ createParentPath: true }),
  (req, res) => {
    const fileName = req.headers["file-name"];
    const isLastChunk = req.headers["is-last-chunk"];
    const fileLocation = path.join(__dirname, "files", fileName);

    req.on("data", (chunk) => {
      try {
        fs.appendFileSync(fileLocation, chunk);
        // console.log(`Chunk received: ${chunk.length}`)
      } catch (error) {
        res.send(`Error saving the chunk: ${error.message}`);
      }
    });

    if (isLastChunk) {
      console.log(`The file is saved to: ${fileLocation}`);
    }
    res.send({
      status: "success",
      message: "Chunk received successfully",
      fileLocation,
    });
  }
);





app.get("/upload/:fileName/info", (req, res) => {
  const { fileName } = req.params;
  const directoryPath = path.join(
    __dirname,
    "chunks",
    `${fileName.split(".")[0]}`
  );

  try {
    const data = fs.readFileSync(path.join(directoryPath, "info"), "utf-8");
    const arr = data.split("\n");
    const receivedChunks = arr[3]
      ? arr[3]?.split(" ").filter((chunkId) => !(chunkId === ""))
      : [];

    return res
      .status(200)
      .send({ fileName: arr[0], receivedChunks: receivedChunks });
  } catch (error) {
    // console.log(`Error while sending metadata: ${error.message}`);
    if (error.message.includes("no such file or directory")) {
      return res.status(404).send({ message: "Creating new file" });
    }
    return res.status(500).send({ error: error.message });
  }
});

app.post("/upload/parallel/first", (req, res) => {
  const { fileName, totalChunks, totalSize } = req.body;
  const directoryPath = path.join(
    __dirname,
    "chunks",
    `${fileName.split(".")[0]}`
  );
  const dataToAppend = `${fileName}\n${totalChunks}\n${totalSize}\n`;

  try {
    fs.mkdirSync(directoryPath, { recursive: true });
    fs.appendFileSync(path.join(directoryPath, "info"), dataToAppend);

    return res.status(200).send({ message: "Ready to receive chunks" });
  } catch (error) {
    console.log(`Error creating directory: ${error.message}`);
    return res
      .status(500)
      .send({ message: `Error creating directory: ${error.message}` });
  }
});

//––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//––––––––––––––––––– Route for parallel uploads –––––––––––––––––––
app.post(
  "/upload/parallel",
  fileUpload({ createParentPath: true }),
  (req, res) => {
    // Handle single file upload
    const {
      files,
      body: { originalName, currentChunk, totalChunks },
    } = req;

    // Create a custom file name for temporary storage
    const CustomFileName = originalName?.split(".")[0] || "untitled";
    const CustomFileLocation = path.join(
      __dirname,
      "chunks",
      CustomFileName,
      `${CustomFileName}-${currentChunk}.mkv`
    );

    // Write the chunks to temporary location
    try {
      fs.writeFileSync(CustomFileLocation, files.file.data)
      fs.appendFileSync(
        path.join(__dirname, "chunks", CustomFileName, "info"),
        `${currentChunk} `
      );
      checkAreAllTheChunksReceived(originalName, totalChunks);
    } catch (err) {
      console.log(`Error while writing chunks: ${err.message}`);
      return res.status(500).send({ message: `Something went wrong: ${err.message}` })
    }

    return res.send({
      status: "success",
      message: "Chunk received successfully",
    });
  }
);

const checkAreAllTheChunksReceived = (originalName, totalChunks) => {
  const CustomFileName = originalName.split(".")[0];
  const infoFilePath = path.join(__dirname, "chunks", CustomFileName, "info");

  const data = fs.readFileSync(infoFilePath, "utf-8");
  const arr = data.split("\n");
  const receivedChunks = arr[3]
    ? arr[3]?.split(" ").filter((chunkId) => !(chunkId === ""))
    : [];

  if(receivedChunks.length === +totalChunks) {
    CombineAllChunks(originalName, totalChunks);
    console.log("File is combined successfully.");
  } else {
    return;
  }
};

const CombineAllChunks = (originalName, totalChunks) => {
  const fileLocation = path.join(__dirname, "files", originalName);
  const CustomFileName = originalName.split(".")[0];

  for (let i = 0; i < totalChunks; i++) {
    // Get the location of chunks and filename
    const filePath = path.join(
      __dirname,
      "chunks",
      CustomFileName,
      `${CustomFileName}-${i}.mkv`
    );

    const data = fs.readFileSync(filePath);
    fs.appendFileSync(fileLocation, data);
    fs.unlinkSync(filePath);
  }

  // Remove the temporary file and directory
  fs.unlinkSync(path.join(__dirname, "chunks", CustomFileName, "info"));
  fs.rmdirSync(path.join(__dirname, "chunks", CustomFileName));

  console.log(`The file is saved to: ${fileLocation}`);
}

//–––––––––––––––––––––––– Listen the server –––––––––––––––––––––––
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
