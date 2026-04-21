const mongoose = require("mongoose");
const { Parser } = require("json2csv");
const fs = require("fs");
const path = require("path");
const dns = require("node:dns/promises");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

// 🔗 MongoDB Connection String
const MONGO_URI = "mongodb+srv://admin:admin@staging.jjfts4o.mongodb.net/2pl";

async function exportCustomers() {
  try {
    console.log("🚀 Export Job Started...");

    const data = await mongoose.connection.db
      .collection("customers")
      .aggregate([
        {
          $lookup: {
            from: "warehouses",
            localField: "warehouse",
            foreignField: "_id",
            as: "warehouseData",
          },
        },
        {
          $lookup: {
            from: "userroles",
            localField: "role",
            foreignField: "_id",
            as: "roleData",
          },
        },
        { $unwind: { path: "$warehouseData", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$roleData", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            username: 1,
            email: 1,
            phone_number: 1,
            userId:1,
            role: "$roleData.role_name",
            warehouse: "$warehouseData.name",
          },
        },
      ])
      .toArray();

    console.log("📦 Records:", data.length);

    const parser = new Parser();
    const csv = parser.parse(data);

    const filePath = path.join(__dirname, `customers-${Date.now()}.csv`);
    fs.writeFileSync(filePath, csv);

    console.log("✅ CSV saved:", filePath);

    process.exit();
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

// 🚀 Proper Mongo Connect FIRST
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");

    exportCustomers(); // run AFTER connection ready
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
  });