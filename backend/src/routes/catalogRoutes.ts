import express from "express";
import {
  AirportModel,
  ChangeRequestModel,
  FlightModel,
  HotelModel,
  RouteModel,
  TaxiCompanyModel
} from "../models/schemas";

const ARRIVAL_AIRPORTS = ["NRT", "HND", "KIX", "DXB", "AUH"];

export const catalogRouter = express.Router();

async function handleGetBootstrap(_req: express.Request, res: express.Response): Promise<void> {
  try {
    const [airports, flights, hotels, routes, companies, pendingChanges] = await Promise.all([
      AirportModel.find({ code: { $in: ARRIVAL_AIRPORTS } }).sort({ code: 1 }).lean(),
      FlightModel.find({ to: { $in: ARRIVAL_AIRPORTS } }).sort({ arrival_local: 1, flight_id: 1 }).lean(),
      HotelModel.find({}).sort({ city: 1, area: 1, name: 1 }).lean(),
      RouteModel.find({}).sort({ airport: 1, city: 1, area: 1 }).lean(),
      TaxiCompanyModel.find({}).sort({ company_id: 1 }).lean(),
      ChangeRequestModel.find({ status: "PENDING" }).lean()
    ]);

    const pendingByCompany = new Map<string, number>();
    for (const change of pendingChanges) {
      const current = pendingByCompany.get(change.company_id) ?? 0;
      pendingByCompany.set(change.company_id, current + 1);
    }

    const suppliers = companies.map((company) => ({
      ...company,
      pending_changes_count: pendingByCompany.get(company.company_id) ?? 0
    }));

    res.status(200).json({
      ok: true,
      data: {
        airports,
        flights,
        hotels,
        routes,
        suppliers
      }
    });
  }
  catch (err) {
    console.error("Bootstrap fetch error:", err);
    res.status(500).json({
      ok: false,
      error: {
        code: "BOOTSTRAP_ERROR",
        message: "Unable to load catalog data from database."
      }
    });
  }
}

catalogRouter.get("/catalog/bootstrap", handleGetBootstrap);
