/**
 * Database seed script for Suraksha.
 *
 * Wipes the collections this script owns and repopulates them with a small,
 * internally-consistent set of sample data (users of every role, disasters,
 * shelters, resources, tasks, volunteers, donations, alerts, notifications)
 * so the API is immediately explorable after a fresh clone.
 *
 * Usage:
 *   npm run seed          # wipe + reseed
 *   npm run seed:destroy  # wipe only
 *
 * Data is deliberately located in and around Assam districts (Guwahati,
 * Dibrugarh, Silchar, Jorhat, Barpeta, Nagaon...) to match the platform's
 * "Suraksha - Assam Disaster Intelligence Platform" scope, and coordinates
 * are real enough to exercise the $geoNear "nearby" endpoints meaningfully.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const User = require("../models/User");
const Disaster = require("../models/Disaster");
const Shelter = require("../models/Shelter");
const Resource = require("../models/Resource");
const Task = require("../models/Task");
const Volunteer = require("../models/Volunteer");
const Donation = require("../models/Donation");
const Alert = require("../models/Alert");
const Notification = require("../models/Notification");
const NewsCategory = require("../models/NewsCategory");
const News = require("../models/News");
const NGO = require("../models/NGO");
const Campaign = require("../models/Campaign");
const EmergencyContact = require("../models/EmergencyContact");
const Counter = require("../models/Counter");

const MODELS_TO_CLEAR = [
  Notification,
  Alert,
  Donation,
  Campaign,
  NGO,
  News,
  NewsCategory,
  EmergencyContact,
  Volunteer,
  Task,
  Resource,
  Shelter,
  Disaster,
  User,
  // Reset every auto-increment counter (disasterId, alertId, ...) alongside
  // the collections that use them, so a reseed always produces the same,
  // predictable DR-1001..DR-1005 style IDs instead of continuing to climb
  // from wherever the previous run left off.
  Counter,
];

const destroyData = async () => {
  for (const Model of MODELS_TO_CLEAR) {
    await Model.deleteMany();
  }
  console.log("All seeded collections cleared.");
};

const seedData = async () => {
  // ---------------------------------------------------------------------
  // Users (one per role, plus a couple of extra citizens/volunteers so
  // lists and filters have something to show)
  // ---------------------------------------------------------------------
  const commonPassword = "Password123";

  const [admin, authorityGuwahati, authorityDibrugarh, volunteerUser1, volunteerUser2, citizen1, citizen2] =
    await User.create([
      {
        name: "Admin User",
        email: "admin@aapdasetu.in",
        password: commonPassword,
        role: "Admin",
        district: "Kamrup Metropolitan",
        phone: "9800000001",
      },
      {
        name: "Rina Bora",
        email: "authority.guwahati@aapdasetu.in",
        password: commonPassword,
        role: "Authority",
        district: "Kamrup Metropolitan",
        phone: "9800000002",
      },
      {
        name: "Pranab Gogoi",
        email: "authority.dibrugarh@aapdasetu.in",
        password: commonPassword,
        role: "Authority",
        district: "Dibrugarh",
        phone: "9800000003",
      },
      {
        name: "Mridul Saikia",
        email: "volunteer1@aapdasetu.in",
        password: commonPassword,
        role: "Volunteer",
        district: "Kamrup Metropolitan",
        phone: "9800000004",
      },
      {
        name: "Priyanka Das",
        email: "volunteer2@aapdasetu.in",
        password: commonPassword,
        role: "Volunteer",
        district: "Cachar",
        phone: "9800000005",
      },
      {
        name: "Anup Kalita",
        email: "citizen1@aapdasetu.in",
        password: commonPassword,
        role: "Citizen",
        district: "Nagaon",
        phone: "9800000006",
      },
      {
        name: "Simanta Deka",
        email: "citizen2@aapdasetu.in",
        password: commonPassword,
        role: "Citizen",
        district: "Barpeta",
        phone: "9800000007",
      },
    ]);

  console.log(`Seeded ${7} users.`);

  // ---------------------------------------------------------------------
  // Disasters
  // ---------------------------------------------------------------------
  const disasters = await Disaster.create([
    {
      type: "Flood",
      location: "Pandu Ghat, Guwahati, Kamrup Metropolitan",
      coordinates: { lat: 26.1584, lng: 91.6716 },
      severity: "Critical",
      description: "Brahmaputra water level above danger mark; low-lying riverside colonies inundated.",
      reportedBy: citizen1._id,
      reportedByName: citizen1.name,
      status: "Verified",
      team: "Guwahati Flood Response Team",
      verifiedBy: authorityGuwahati._id,
    },
    {
      type: "Flood",
      location: "Dibrugarh Town, Dibrugarh",
      coordinates: { lat: 27.4728, lng: 94.912 },
      severity: "High",
      description: "Embankment breach reported near tea estate belt; several homes waterlogged.",
      reportedBy: citizen2._id,
      reportedByName: citizen2.name,
      status: "In Progress",
      team: "Dibrugarh Relief Team",
      verifiedBy: authorityDibrugarh._id,
    },
    {
      type: "Landslide",
      location: "Haflong Hills, Dima Hasao",
      coordinates: { lat: 25.1667, lng: 93.0167 },
      severity: "Medium",
      description: "Minor landslide blocking a stretch of NH-27 after continuous rainfall.",
      reportedBy: volunteerUser2._id,
      reportedByName: volunteerUser2.name,
      status: "Pending",
      team: "Unassigned",
    },
    {
      type: "Fire",
      location: "Fancy Bazaar, Guwahati, Kamrup Metropolitan",
      coordinates: { lat: 26.1857, lng: 91.7362 },
      severity: "Medium",
      description: "Fire broke out in a market complex, contained by local fire services.",
      reportedBy: citizen1._id,
      reportedByName: citizen1.name,
      status: "Resolved",
      team: "Guwahati Fire & Rescue",
      verifiedBy: authorityGuwahati._id,
    },
    {
      type: "Cyclone",
      location: "Silchar, Cachar",
      coordinates: { lat: 24.8333, lng: 92.7789 },
      severity: "Low",
      description: "Remnant cyclonic winds causing tree falls and minor power outages.",
      reportedBy: volunteerUser2._id,
      reportedByName: volunteerUser2.name,
      status: "Pending",
      team: "Unassigned",
    },
  ]);

  console.log(`Seeded ${disasters.length} disasters.`);
  const [floodGuwahati, floodDibrugarh, landslideHaflong] = disasters;

  // ---------------------------------------------------------------------
  // Shelters
  // ---------------------------------------------------------------------
  const shelters = await Shelter.create([
    {
      name: "Guwahati Central Relief Camp",
      location: "Latasil Playground, Guwahati, Kamrup Metropolitan",
      coordinates: { lat: 26.1833, lng: 91.7458 },
      capacity: 300,
      currentOccupancy: 210,
      resources: { food: true, water: true, medical: true, bedding: true },
      contactPerson: "Rina Bora",
      contactPhone: "9800000002",
      managedBy: authorityGuwahati._id,
    },
    {
      name: "Pandu Higher Secondary School Camp",
      location: "Pandu, Guwahati, Kamrup Metropolitan",
      coordinates: { lat: 26.1685, lng: 91.6653 },
      capacity: 150,
      currentOccupancy: 150,
      resources: { food: true, water: true, medical: false, bedding: true },
      contactPerson: "Rina Bora",
      contactPhone: "9800000002",
      managedBy: authorityGuwahati._id,
    },
    {
      name: "Dibrugarh Town Hall Shelter",
      location: "A.T. Road, Dibrugarh",
      coordinates: { lat: 27.4831, lng: 94.9097 },
      capacity: 200,
      currentOccupancy: 95,
      resources: { food: true, water: true, medical: true, bedding: false },
      contactPerson: "Pranab Gogoi",
      contactPhone: "9800000003",
      managedBy: authorityDibrugarh._id,
    },
    {
      name: "Haflong Community Hall",
      location: "Haflong, Dima Hasao",
      coordinates: { lat: 25.1621, lng: 93.0189 },
      capacity: 80,
      currentOccupancy: 0,
      resources: { food: false, water: true, medical: false, bedding: false },
      contactPerson: "Pranab Gogoi",
      contactPhone: "9800000003",
      status: "Closed",
      managedBy: authorityDibrugarh._id,
    },
  ]);

  console.log(`Seeded ${shelters.length} shelters.`);
  const [shelterCentral, shelterPandu, shelterDibrugarh] = shelters;

  // ---------------------------------------------------------------------
  // Resources
  // ---------------------------------------------------------------------
  const resources = await Resource.create([
    {
      name: "Rice (25kg bags)",
      category: "Food",
      quantity: 180,
      unit: "bags",
      lowStockThreshold: 30,
      shelter: shelterCentral._id,
      disaster: floodGuwahati._id,
      location: "Latasil Playground, Guwahati",
      addedBy: authorityGuwahati._id,
    },
    {
      name: "Packaged Drinking Water (1L)",
      category: "Water",
      quantity: 25,
      unit: "cases",
      lowStockThreshold: 30,
      shelter: shelterCentral._id,
      disaster: floodGuwahati._id,
      location: "Latasil Playground, Guwahati",
      addedBy: authorityGuwahati._id,
      notes: "Running low, restock requested from district warehouse.",
    },
    {
      name: "First Aid Kits",
      category: "Medical",
      quantity: 40,
      unit: "kits",
      lowStockThreshold: 10,
      shelter: shelterCentral._id,
      disaster: floodGuwahati._id,
      location: "Latasil Playground, Guwahati",
      addedBy: authorityGuwahati._id,
    },
    {
      name: "Blankets",
      category: "Bedding",
      quantity: 5,
      unit: "pieces",
      lowStockThreshold: 20,
      shelter: shelterPandu._id,
      disaster: floodGuwahati._id,
      location: "Pandu Higher Secondary School Camp",
      addedBy: authorityGuwahati._id,
    },
    {
      name: "Tarpaulin Sheets",
      category: "Equipment",
      quantity: 60,
      unit: "pieces",
      lowStockThreshold: 15,
      shelter: shelterDibrugarh._id,
      disaster: floodDibrugarh._id,
      location: "Dibrugarh Town Hall Shelter",
      addedBy: authorityDibrugarh._id,
    },
  ]);

  console.log(`Seeded ${resources.length} resources.`);

  // ---------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------
  const tasks = await Task.create([
    {
      title: "Distribute food packets at Latasil camp",
      description: "Morning distribution round for families staying at the central relief camp.",
      category: "Relief Distribution",
      priority: "High",
      status: "In Progress",
      assignedTo: volunteerUser1._id,
      assignedBy: authorityGuwahati._id,
      relatedDisaster: floodGuwahati._id,
      relatedShelter: shelterCentral._id,
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Medical checkup camp at Pandu shelter",
      description: "Coordinate with district health team for a basic checkup drive.",
      category: "Medical",
      priority: "Critical",
      status: "Pending",
      assignedTo: volunteerUser1._id,
      assignedBy: authorityGuwahati._id,
      relatedDisaster: floodGuwahati._id,
      relatedShelter: shelterPandu._id,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Boat rescue survey near Pandu Ghat",
      description: "Assess stranded households and coordinate boat rescue routes.",
      category: "Rescue",
      priority: "Critical",
      status: "Completed",
      assignedTo: volunteerUser1._id,
      assignedBy: authorityGuwahati._id,
      relatedDisaster: floodGuwahati._id,
      notes: "12 households evacuated safely.",
    },
    {
      title: "Tarpaulin distribution in Dibrugarh town",
      description: "Distribute waterproof sheets to waterlogged households.",
      category: "Logistics",
      priority: "Medium",
      status: "Pending",
      assignedTo: volunteerUser2._id,
      assignedBy: authorityDibrugarh._id,
      relatedDisaster: floodDibrugarh._id,
      relatedShelter: shelterDibrugarh._id,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Clear debris from NH-27 landslide site",
      description: "Coordinate with PWD for debris clearance near Haflong.",
      category: "Logistics",
      priority: "Medium",
      status: "Pending",
      assignedBy: authorityDibrugarh._id,
      relatedDisaster: landslideHaflong._id,
    },
  ]);

  console.log(`Seeded ${tasks.length} tasks.`);

  // ---------------------------------------------------------------------
  // Volunteers
  // ---------------------------------------------------------------------
  const volunteers = await Volunteer.create([
    {
      user: volunteerUser1._id,
      skills: ["First Aid", "Swimming", "Driving"],
      district: "Kamrup Metropolitan",
      availability: "Available",
      status: "Approved",
      assignedDisaster: floodGuwahati._id,
      assignedShelter: shelterCentral._id,
      verifiedBy: authorityGuwahati._id,
    },
    {
      user: volunteerUser2._id,
      skills: ["Cooking", "Logistics", "Translation (Bengali/Assamese)"],
      district: "Cachar",
      availability: "Available",
      status: "Pending",
    },
  ]);

  console.log(`Seeded ${volunteers.length} volunteer profiles.`);

  // ---------------------------------------------------------------------
  // Donations
  // ---------------------------------------------------------------------
  const donations = await Donation.create([
    {
      donorName: "Assam Tea Traders Association",
      donorEmail: "contact@assamteatraders.example",
      donorPhone: "9811111111",
      type: "Cash",
      amount: 250000,
      paymentMethod: "Bank Transfer",
      transactionId: "TXN-AS-000123",
      relatedDisaster: floodGuwahati._id,
      status: "Received",
      receivedBy: authorityGuwahati._id,
      recordedBy: authorityGuwahati._id,
      notes: "Earmarked for food and medical supplies at Guwahati camps.",
    },
    {
      donorName: "Anup Kalita",
      type: "Kind",
      itemName: "Rice bags (25kg)",
      quantity: 50,
      unit: "bags",
      relatedDisaster: floodGuwahati._id,
      relatedShelter: shelterCentral._id,
      status: "Utilized",
      receivedBy: authorityGuwahati._id,
      recordedBy: citizen1._id,
    },
    {
      donorName: "Dibrugarh Rotary Club",
      donorEmail: "info@dibrugarhrotary.example",
      type: "Cash",
      amount: 75000,
      paymentMethod: "UPI",
      transactionId: "TXN-AS-000456",
      relatedDisaster: floodDibrugarh._id,
      status: "Pending",
      recordedBy: authorityDibrugarh._id,
    },
    {
      donorName: "Simanta Deka",
      type: "Kind",
      itemName: "Blankets",
      quantity: 30,
      unit: "pieces",
      relatedShelter: shelterPandu._id,
      status: "Pending",
      recordedBy: citizen2._id,
    },
  ]);

  console.log(`Seeded ${donations.length} donations.`);

  // ---------------------------------------------------------------------
  // News categories + News
  // ---------------------------------------------------------------------
  const newsCategories = await NewsCategory.create([
    { name: "Flood", createdBy: admin._id },
    { name: "Earthquake", createdBy: admin._id },
    { name: "Cyclone", createdBy: admin._id },
    { name: "Landslide", createdBy: admin._id },
    { name: "Fire", createdBy: admin._id },
    { name: "Government", createdBy: admin._id },
  ]);
  console.log(`Seeded ${newsCategories.length} news categories.`);
  const [catFlood, catEarthquake, catCyclone, catLandslide, catFire, catGovernment] = newsCategories;

  const newsItems = await News.create([
    {
      headline: "Brahmaputra water level rises alarmingly, ASDMA issues flood warning for Kamrup district",
      summary: "The Brahmaputra river crossed the danger mark at Guwahati, with an orange alert issued for Kamrup, Barpeta and Dhubri districts.",
      content: "The Brahmaputra river crossed the danger mark at Guwahati on Thursday, with water level recorded at 49.48m against the danger level of 49.27m. ASDMA has issued an orange alert for Kamrup, Barpeta, and Dhubri districts and advised residents in low-lying areas to move to relief camps.",
      category: catFlood._id,
      region: "Guwahati",
      isEmergency: true,
      verified: true,
      verifiedBy: authorityGuwahati._id,
      status: "Published",
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      relatedDisaster: floodGuwahati._id,
      createdBy: authorityGuwahati._id,
      assignedTo: authorityGuwahati._id,
    },
    {
      headline: "CM announces relief package for flood-affected districts in Assam",
      summary: "A comprehensive relief package has been announced for flood-affected districts including Kamrup, Nalbari, Barpeta, Dhubri and Dibrugarh.",
      content: "The state government announced a comprehensive relief package for flood-affected districts including Kamrup, Nalbari, Barpeta, Dhubri, and Dibrugarh. The funds will be used for relief camps, food supply and reconstruction of damaged infrastructure.",
      category: catGovernment._id,
      region: "Assam",
      isEmergency: false,
      verified: true,
      verifiedBy: admin._id,
      status: "Published",
      publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      createdBy: admin._id,
    },
    {
      headline: "Landslides block NH-27 in Dima Hasao; clearance underway",
      summary: "Heavy rainfall triggered landslides along National Highway 27 near Haflong; road clearance operations are underway.",
      content: "Heavy rainfall triggered multiple landslides along National Highway 27 near Haflong in Dima Hasao district. PWD teams have been deployed and road clearance operations are underway. Motorists are advised to use alternate routes until further notice.",
      category: catLandslide._id,
      region: "Karbi Anglong",
      isEmergency: false,
      verified: false,
      status: "Published",
      publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      relatedDisaster: landslideHaflong._id,
      createdBy: authorityDibrugarh._id,
      assignedTo: authorityDibrugarh._id,
    },
    {
      headline: "Fire breaks out in Fancy Bazaar market area; contained by local fire services",
      summary: "A fire broke out in the Fancy Bazaar market complex in Guwahati; the blaze has been fully contained with no casualties reported.",
      content: "A fire broke out in the Fancy Bazaar market complex in Guwahati on Wednesday. Fire tenders from local stations controlled the blaze after a few hours of effort. No casualties were reported, and the district administration has begun a damage assessment.",
      category: catFire._id,
      region: "Guwahati",
      isEmergency: false,
      verified: true,
      verifiedBy: authorityGuwahati._id,
      status: "Published",
      publishedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      createdBy: authorityGuwahati._id,
      assignedTo: authorityGuwahati._id,
    },
    {
      headline: "Bay of Bengal low pressure may intensify; IMD warns of heavy rain in Assam",
      summary: "A low pressure area in the Bay of Bengal may intensify in the coming days, which could bring heavy rainfall across Assam.",
      content: "A low pressure area in the Bay of Bengal may intensify into a cyclonic system in the next 72 hours, which could bring heavy to extremely heavy rainfall across northeast India including Assam. Residents in coastal and low-lying districts are advised to stay alert.",
      category: catCyclone._id,
      region: "Assam",
      isEmergency: false,
      verified: false,
      status: "Published",
      publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      createdBy: admin._id,
    },
  ]);
  console.log(`Seeded ${newsItems.length} news items.`);

  // ---------------------------------------------------------------------
  // NGOs + Campaigns
  // ---------------------------------------------------------------------
  const ngos = await NGO.create([
    {
      name: "Assam Relief Foundation",
      type: "Relief & Rescue",
      registrationNumber: "NGO-ASM-2014-0231",
      areaOfOperation: "Kamrup Metropolitan",
      activities: "Emergency food distribution, shelter management and boat rescue operations during floods.",
      contactPhone: "9811100001",
      contactEmail: "contact@assamrelief.example",
      website: "www.assamrelief.example",
      bankName: "State Bank of India",
      ifsc: "SBIN0001234",
      accountNumber: "30012345678",
      status: "Approved",
      reviewedBy: admin._id,
      registeredBy: authorityGuwahati._id,
      documentsVerified: true,
      documentsVerifiedBy: admin._id,
      identityVerified: true,
      identityVerifiedBy: admin._id,
    },
    {
      name: "Brahmaputra Health Trust",
      type: "Medical & Health",
      registrationNumber: "NGO-ASM-2017-0789",
      areaOfOperation: "Dibrugarh",
      activities: "Mobile medical camps and first-aid support for flood and cyclone affected communities.",
      contactPhone: "9811100002",
      contactEmail: "info@brahmaputrahealth.example",
      website: "www.brahmaputrahealth.example",
      bankName: "HDFC Bank",
      ifsc: "HDFC0004567",
      accountNumber: "50100987654",
      status: "Approved",
      reviewedBy: admin._id,
      registeredBy: authorityDibrugarh._id,
      documentsVerified: true,
      documentsVerifiedBy: admin._id,
      identityVerified: true,
      identityVerifiedBy: admin._id,
    },
    {
      name: "Northeast Youth Volunteers",
      type: "General Relief",
      registrationNumber: "NGO-ASM-2021-0456",
      areaOfOperation: "Cachar",
      activities: "Volunteer coordination and relief material distribution in the Barak Valley.",
      contactPhone: "9811100003",
      contactEmail: "hello@neyouthvolunteers.example",
      status: "Pending",
      registeredBy: citizen2._id,
    },
  ]);
  console.log(`Seeded ${ngos.length} NGOs.`);
  const [ngoRelief, ngoHealth] = ngos;

  const campaigns = await Campaign.create([
    {
      title: "Guwahati Flood Emergency Relief Fund",
      ngo: ngoRelief._id,
      relatedDisaster: floodGuwahati._id,
      description: "Raising funds for food packets, drinking water and temporary shelter materials for flood-hit families in Guwahati.",
      location: "Guwahati, Kamrup Metropolitan",
      target: 1000000,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      bankDetails: "SBIN0001234 / 30012345678",
      status: "Active",
      approvalStatus: "Approved",
      approvedBy: admin._id,
      approvedAt: new Date(),
      createdBy: authorityGuwahati._id,
    },
    {
      title: "Dibrugarh Mobile Medical Camp Drive",
      ngo: ngoHealth._id,
      relatedDisaster: floodDibrugarh._id,
      description: "Funding mobile medical camps and essential medicines for waterlogged neighbourhoods in Dibrugarh.",
      location: "Dibrugarh",
      target: 500000,
      deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      bankDetails: "HDFC0004567 / 50100987654",
      status: "Active",
      approvalStatus: "Approved",
      approvedBy: admin._id,
      approvedAt: new Date(),
      createdBy: authorityDibrugarh._id,
    },
  ]);
  console.log(`Seeded ${campaigns.length} campaigns.`);

  // Link a couple of the already-seeded cash donations to these campaigns so
  // each campaign's live raised/donor totals (computed from Donation records
  // - see campaignController.withRaisedTotals) aren't stuck at zero.
  await Donation.updateOne({ _id: donations[0]._id }, { relatedCampaign: campaigns[0]._id });
  await Donation.updateOne({ _id: donations[2]._id }, { relatedCampaign: campaigns[1]._id });

  // ---------------------------------------------------------------------
  // Emergency contacts
  // ---------------------------------------------------------------------
  const contacts = await EmergencyContact.create([
    { name: "Police", number: "100", category: "Police", order: 1, createdBy: admin._id },
    { name: "Fire Service", number: "101", category: "Fire", order: 2, createdBy: admin._id },
    { name: "Ambulance", number: "102", category: "Medical", order: 3, createdBy: admin._id },
    { name: "ASDMA State Emergency Operations Centre", number: "1070", category: "Disaster Management", order: 4, createdBy: admin._id },
    { name: "NDRF Guwahati", number: "1078", category: "Disaster Management", order: 5, createdBy: admin._id },
    { name: "Women's Helpline", number: "1091", category: "Relief", order: 6, createdBy: admin._id },
  ]);
  console.log(`Seeded ${contacts.length} emergency contacts.`);

  // ---------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------
  const alerts = await Alert.create([
    {
      title: "Brahmaputra above danger level at Guwahati",
      type: "Flood",
      location: "Guwahati, Kamrup Metropolitan",
      priority: "Critical",
      description: "Residents in low-lying areas near the riverbank advised to move to relief camps immediately.",
      issuedBy: authorityGuwahati._id,
      active: true,
      relatedDisaster: floodGuwahati._id,
    },
    {
      title: "Embankment breach risk in Dibrugarh",
      type: "Flood",
      location: "Dibrugarh",
      priority: "High",
      description: "Monitoring an embankment section under stress; precautionary evacuation advised nearby.",
      issuedBy: authorityDibrugarh._id,
      active: true,
      relatedDisaster: floodDibrugarh._id,
    },
    {
      title: "NH-27 partially blocked near Haflong",
      type: "Landslide",
      location: "Dima Hasao",
      priority: "Medium",
      description: "Motorists advised to use alternate routes until debris clearance is complete.",
      issuedBy: authorityDibrugarh._id,
      active: true,
      relatedDisaster: landslideHaflong._id,
    },
    {
      title: "Fancy Bazaar fire contained",
      type: "Fire",
      location: "Guwahati, Kamrup Metropolitan",
      priority: "Low",
      description: "Fire at the market complex has been fully contained; no further risk to the public.",
      issuedBy: authorityGuwahati._id,
      active: false,
    },
  ]);

  console.log(`Seeded ${alerts.length} alerts.`);

  // ---------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------
  const notifications = await Notification.create([
    {
      recipient: null, // broadcast
      type: "Alert",
      title: "New critical alert issued",
      message: "Brahmaputra above danger level at Guwahati - move to relief camps immediately.",
      relatedAlert: alerts[0]._id,
      relatedDisaster: floodGuwahati._id,
      createdBy: authorityGuwahati._id,
    },
    {
      recipient: volunteerUser1._id,
      type: "Task",
      title: "New task assigned",
      message: "You have been assigned: Distribute food packets at Latasil camp.",
      relatedTask: tasks[0]._id,
      createdBy: authorityGuwahati._id,
    },
    {
      recipient: authorityGuwahati._id,
      type: "Donation",
      title: "New donation recorded",
      message: "A cash donation of INR 2,50,000 was recorded for the Guwahati flood response.",
      relatedDonation: donations[0]._id,
      createdBy: authorityGuwahati._id,
    },
    {
      recipient: null, // broadcast
      type: "System",
      title: "Low stock warning",
      message: "Packaged drinking water is running low at Guwahati Central Relief Camp.",
      relatedShelter: shelterCentral._id,
      createdBy: null,
    },
  ]);

  console.log(`Seeded ${notifications.length} notifications.`);

  console.log("\nSeeded login credentials (all use the same password):");
  console.log(`  Password: ${commonPassword}`);
  console.log(`  Admin:      ${admin.email}`);
  console.log(`  Authority:  ${authorityGuwahati.email} / ${authorityDibrugarh.email}`);
  console.log(`  Volunteer:  ${volunteerUser1.email} / ${volunteerUser2.email}`);
  console.log(`  Citizen:    ${citizen1.email} / ${citizen2.email}`);
};

const run = async () => {
  await connectDB();

  const destroyOnly = process.argv.includes("--destroy");

  try {
    await destroyData();
    if (!destroyOnly) {
      await seedData();
      console.log("\nSeeding complete.");
    } else {
      console.log("Destroy-only run complete (no data reseeded).");
    }
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();
