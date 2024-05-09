import { useState } from "react";
import "./App.css";
import axios from "axios";
import PQueue from "p-queue";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [totalChunks, setTotalChunks] = useState(0);
  const [progress, setProgress] = useState(0);
  const chunkSize = 10 * 1024 * 1024; // 10MB

  // Upload file in One Shot
  const sendOneShot = async () => {
    const formData = new FormData();
    formData.append("file", selectedFile.slice());
    formData.append("originalName", selectedFile.name);

    try {
      const res = await axios.post("http://localhost:8080/upload", formData);
      console.log(res.data.message);
      setErrorMessage(res.data.message);
    } catch (error) {
      console.log("Error uploading file: " + error.message);
      setErrorMessage("Error uploading file: " + error.message);
    }
  };

  // Upload file in chunks
  const sendChunked = async () => {
    for (let chunkId = 0; chunkId < totalChunks; chunkId++) {
      const chunk = selectedFile.slice(
        chunkId * chunkSize,
        chunkId * chunkSize + chunkSize
      );

      try {
        const response = await axios.post(
          "http://localhost:8080/upload/chunk",
          chunk,
          {
            headers: {
              "content-type": "application/octet-stream",
              "content-length": chunk.length,
              "file-name": selectedFile.name,
              "is-last-chunk": chunkId + 1 === totalChunks,
            },
          }
        );

        setProgress(Math.round((chunkId * 100) / totalChunks));
        setErrorMessage(response.data.message);
      } catch (error) {
        console.log(`Error while sending chunks: ${error.message}`);
        setErrorMessage(`Error while sending chunks: ${error.message}`);
      }
    }

    setProgress(100);
    setErrorMessage(`The whole file is uploaded successfully.`);
  };

  // Define your request function
  const makeRequest = (currentChunk) => {
    // console.log(`CurrentChunk: ${currentChunk}`);

    // Create a chunk
    const startByte = currentChunk * chunkSize;
    const endByte = Math.min(
      currentChunk * chunkSize + chunkSize,
      selectedFile.size
    );
    const chunk = selectedFile.slice(startByte, endByte);

    // Create multipart request
    const formData = new FormData();
    formData.append("file", chunk);
    formData.append("totalChunks", totalChunks);
    formData.append("currentChunk", currentChunk);
    formData.append("originalName", selectedFile.name);

    // Set the progress percentage
    setProgress(Math.round((currentChunk * 100) / totalChunks));

    // Make post request
    return axios.post("http://localhost:8080/upload/parallel", formData);
  };

  // Upload file in 6 parallel chunks
  const sendParallelly = async () => {
    // Create a queue with a concurrency of 6
    const queue = new PQueue({ concurrency: 6 });
    let data = new Array(totalChunks).fill().map((_, i) => i);
    let isInfoFilePresent = false;

    try {
      const res = await axios.get(
        `http://localhost:8080/upload/${selectedFile.name}/info`
      );
      const receivedChunks = res.data.receivedChunks.map((chunkId) =>
        parseInt(chunkId)
      );

      data = data.filter((chunkId) => !receivedChunks.includes(chunkId));
      isInfoFilePresent = true;
      console.log(`The upload is resumed now`);
    } catch (error) {
      if (error.response.status === 404) {
        try {
          axios.post("http://localhost:8080/upload/parallel/first", {
            fileName: selectedFile.name,
            totalChunks,
            totalSize: selectedFile.size,
          });
          isInfoFilePresent = true;
        } catch (error) {
          console.log(`Something went wrong: ${error.message}`);
          return;
        }
      }

      console.log(error.response.data.message);
    }

    if (!isInfoFilePresent) {
      setErrorMessage(`Something went wrong, please try again!`);
      return;
    }

    // Add promises with chunk ids
    const promises = data.map((item) => {
      return queue.add(() => makeRequest(item));
    });

    // Use Promise.all to wait for all requests to complete
    Promise.all(promises)
      .then(async (responses) => {
        console.log("All responses:", responses);
        setErrorMessage("File Uploaded Successfully.");
        setProgress(100);
      })
      .catch((error) => {
        console.error("Error in one of the requests:", error);
      });
  };

  // Handle on change event
  const handleOnChange = (e) => {
    const currentFile = e.target.files[0];
    console.log(currentFile);
    if (!currentFile) return;

    setSelectedFile(currentFile);
    setTotalChunks(Math.ceil(currentFile.size / chunkSize));
    setErrorMessage("");
    setProgress(0);
  };

  return (
    <>
      <input type="file" onChange={handleOnChange} />
      <button onClick={sendParallelly}> Send Parallelly </button>
      <button onClick={sendOneShot}> Send One Shot </button>
      <button onClick={sendChunked}> Send Chunked </button>
      <p>
        {progress}
        {progress && "%"}
      </p>
      <p>{errorMessage}</p>
    </>
  );
}

export default App;
