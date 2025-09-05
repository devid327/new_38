import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { PORT } from "./config/config";
import { connectDb } from "./config";
import routes from "./route";

const app = express();

// Set up Cross-Origin Resource Sharing (CORS) options
app.use(cors());

// Parse incoming JSON requests using body-parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", routes);

const projectFunction = async () => {
  await connectDb();
  // Run the `summaryRaid` function every 3 minutes
  // monitorTweet.start();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}/`);
  });
};

projectFunction();
