import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { bookingRouter } from "./routes/bookingRoutes";
import { catalogRouter } from "./routes/catalogRoutes";
import { changeRouter } from "./routes/changeRoutes";
import { requestRouter } from "./routes/requestRoutes";
import { supplierRouter } from "./routes/supplierRoutes";
import { seedDatabase } from "./seed/seedDatabase";
import type { SeedSummary } from "./seed/seedDatabase";

const envOptions = {
  path: path.resolve(__dirname, "../.env")
};
dotenv.config(envOptions);

const app = express();
const PORT = Number(process.env.PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/airport_taxi_offers";
const DATA_DIR = path.resolve(__dirname, "../../data");

let latestSeedSummary: SeedSummary | null = null;

app.use(cors());
app.use(express.json());

function handleHealthCheck(_req: express.Request, res: express.Response): void {
  const dataExists = fs.existsSync(path.join(DATA_DIR, "problem-2", "taxi_companies.json"));
  const dbConnected = mongoose.connection.readyState === 1;
  const responseBody = {
    ok: true,
    data: {
      status: "healthy",
      mongoConnected: dbConnected,
      database: mongoose.connection.name || "airport_taxi_offers",
      dataDirectoryReady: dataExists,
      seededCounts: latestSeedSummary
    }
  };

  res.status(200).json(responseBody);
}

function onServerListening(): void {
  console.log(`Backend listening on http://localhost:${PORT}`);
}

app.get("/api/health", handleHealthCheck);
app.use("/api", catalogRouter);
app.use("/api", requestRouter);
app.use("/api", supplierRouter);
app.use("/api", bookingRouter);
app.use("/api", changeRouter);

async function startServer(): Promise<void> {
  try {
    const connectOptions = {
      dbName: "airport_taxi_offers",
      serverSelectionTimeoutMS: 5000
    };
    await mongoose.connect(MONGODB_URI, connectOptions);
    console.log(`MongoDB connected (${mongoose.connection.name})`);

    latestSeedSummary = await seedDatabase(DATA_DIR);
    console.log("Startup seed complete:", latestSeedSummary);

    app.listen(PORT, onServerListening);
  }
  catch (err) {
    console.error(`MongoDB startup or seed failed for ${MONGODB_URI}:`, err);
    process.exit(1);
  }
}

void startServer();
