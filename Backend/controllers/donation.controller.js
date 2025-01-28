const errorHandler = require("express-async-handler");
const Donation = require("../models/donation.model");
const mongoose = require("mongoose");

const User = require("../models/user.model");
const Request = require("../models/request.model");
const fs = require("fs");
const path = require("path");

const handleupload = async (file) => {
  try {
    if (!file) {
      throw new Error("No file provided.");
    }

    const matches = file.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image format.");
    }

    const imageType = matches[1]; // e.g., 'image/png', 'image/jpeg'
    const base64Image = matches[2];

    const imageBuffer = Buffer.from(base64Image, "base64");

    const uploadDir = path.join(__dirname, "images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir); // Create directory if it doesn't exist
    }

    const filePath = path.join(
      uploadDir,
      `${Date.now()}.${imageType.split("/")[1]}`
    ); // Save file with correct extension
    fs.writeFileSync(filePath, imageBuffer);

    return filePath; // Return file path
  } catch (error) {
    console.error("Error in handleupload:", error.message);
    throw error; // Propagate the error for handling in `postDonation`
  }
};

const postDonation = errorHandler(async (req, res) => {
  const {
    quantity,
    receiverId,
    shelfLife,
    location,
    donationPicture,
    requestId,
    isOrganisation,
    orgID,
  } = req.body;

  try {
    const user = req.user;
    const donorId = user.id;

    let receiverObjectId = null;

    // Validate and convert `receiverId` to ObjectId if provided
    if (receiverId) {
      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ msg: "Invalid receiverId" });
      }
      receiverObjectId = new mongoose.Types.ObjectId(receiverId);
    }

    // Upload the donation picture
    let pictureUrl = "";
    if (donationPicture) {
      pictureUrl = await handleupload(donationPicture);
    }

    let volunteerId = null;

    const userObj = await User.findById(donorId);
    if (userObj.role === "volunteer") {
      volunteerId = userObj._id;
    }

    let organisazationId = null;
    if (isOrganisation) {
      if (!mongoose.Types.ObjectId.isValid(orgID)) {
        return res.status(400).json({ msg: "Invalid orgID" });
      }
      organisazationId = new mongoose.Types.ObjectId(orgID);
    }

    const newDonation = new Donation({
      donorId,
      location,
      quantity,
      status: "pending",
      shelfLife,
      receiverId: isOrganisation ? organisazationId : receiverId,
      needVolunteer: false,
      volunteerId: volunteerId,
      donationPicture: pictureUrl,
    });

    if (!isOrganisation) {
      let requestObjectId = null;
      if (requestId) {
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
          return res.status(400).json({ msg: "Invalid requestId" });
        }
        requestObjectId = new mongoose.Types.ObjectId(requestId);
      }

      const request = await Request.findOne({
        _id: requestObjectId,
        isActive: true,
      });

      if (!request) {
        return res.status(404).json({ msg: "Request not found" });
      }

      if (quantity >= request.quantity) {
        request.quantity = 0;
        request.isActive = false;
      } else {
        request.quantity -= quantity;
      }
      await request.save();
    }

    const savedDonation = await newDonation.save();

    res
      .status(201)
      .json({ msg: "Donation request sent successfully", savedDonation });
  } catch (err) {
    console.error("Error creating donation:", err);
    res
      .status(400)
      .json({ msg: "Error creating donation", error: err.message });
  }
});

const deleteDonation = async (req, res) => {
  const donationId = req.params.id;
  try {
    const donation = await Donation.findByIdAndDelete(donationId);
    res.status(200).json({
      msg: "Donation deleted successfully",
      deletedDonation: donation,
    });
  } catch (error) {
    console.error("Error deleting donations:", error);
    res.status(500).json({ msg: "Error deleting donations", error });
  }
};

const acceptDonation = async (req, res) => {
  const { volunteer } = req.body; // Expecting a boolean value for 'volunteer'
  const donationId = req.params.id;

  try {
    // Find the donation by ID
    const donation = await Donation.findById(donationId);

    if (!donation) {
      return res.status(404).json({ msg: "Donation not found" });
    }

    // Update the status and needVolunteer fields
    donation.needVolunteer = donation.needVolunteer && volunteer;
    donation.status = donation.needVolunteer
      ? "assigning_volunteer"
      : "self_pickup";

    // updating existing requests of receiver
    const request = await Request.findOne({ receiverId: req.user.id });
    if (request.quantity - quantity <= 0) {
      const deletedRequest = await Request.findByIdAndDelete(request._id);
    } else {
      request.quantity = request.quantity - quantity;
      const updatedRequest = await request.save();
    }

    // Save the updated donation
    const updatedDonation = await donation.save();

    if (donation.status === "assigning_volunteer") {
      // send message to nearest volunteer and display these donations only in their page
      // *************************************
      // *****
      // *****         CODE
      // *****
      // *************************************
    }
    res.status(200).json({
      msg: "Donation updated successfully",
      updatedDonation,
    });
  } catch (error) {
    console.error("Error accepting donation:", error);
    res.status(500).json({ msg: "Error accepting donation", error });
  }
};

const assignVolunteer = async (req, res) => {
  const volunteerId = req.user._id;
  const donationId = req.params.id;

  try {
    const donation = await Donation.findById(donationId);
    donation.volunteerId = volunteerId;
    const updatedDonation = await donation.save();

    // send volunteer details to donor and receiver
    // *************************************
    // *****
    // *****         CODE
    // *****
    // *************************************

    res
      .status(200)
      .json({ msg: "Volunteer assigned successfully", updatedDonation });
  } catch (error) {
    console.error("Error assigning volunteer:", error);
    res.status(500).json({ msg: "Error assigning volunteer", error });
  }
};

const getDonations = async (req, res) => {
  try {
    const { lat, long } = req.body;

    if (!lat || !long) {
      return res
        .status(400)
        .json({ msg: "Current location (lat and long) is required" });
    }

    // Find donations near the provided current location (within 10km radius)
    const donations = await Donation.find({
      "location.lat": { $exists: true },
      "location.long": { $exists: true },
      status: "accepted",
    }).find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(long), parseFloat(lat)],
          },
          $maxDistance: 5000, // 5km in meters
        },
      },
    });

    res.status(200).json(donations);
  } catch (error) {
    console.error("Error fetching donations:", error);
    res.status(500).json({ msg: "Error fetching donations", error });
  }
};

const donarAccept = async (req, res) => {
  console.log(req.user); // Debugging the user id
  try {
    // Query donations using donorId
    const donations = await Donation.find({ donorId: req.user.id });
    console.log(donations); // Debugging the response

    if (donations.length === 0) {
      return res
        .status(200)
        .json({ msg: "No donations Currently", donations: [] });
    }

    // Filter donations based on status
    const matchedDonations = donations.filter(
      (donation) =>
        donation.status === "approved" ||
        donation.status === "pickbyreceiver" ||
        donation.status === "rejected"
    );

    if (matchedDonations.length === 0) {
      return res.status(200).json({
        msg: "No donations with the required status found",
        donations: matchedDonations,
      });
    }

    // Return all matching donations
    return res.status(200).json({
      msg: "Fetched Donations with required status",
      donations: matchedDonations,
    });
  } catch (err) {
    console.error("Error accepting donation:", err);
    res.status(500).json({ msg: "Error accepting donation", error: err });
  }
};
//if volunteer accepts the donation the status is changed to pickedByVolunteer

const updateDonationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const donation = await Donation.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!donation) {
      return res.status(404).json({ msg: "Donation not found" });
    }

    res.status(200).json({ msg: "Donation status updated", donation });
  } catch (err) {
    res.status(500).json({ msg: "Error updating donation status", error: err });
  }
};

// donor wants to self volunteer then status will be updated to pickbydonor
const markAsSelfVolunteer = async (req, res) => {
  try {
    const { id } = req.params;

    const donation = await Donation.findByIdAndUpdate(
      id,
      { status: "pickbydonor" },
      { new: true }
    );

    if (!donation) {
      return res.status(404).json({ msg: "Donation not found" });
    }

    res
      .status(200)
      .json({ msg: "Donation status updated to pickbydonor", donation });
  } catch (err) {
    res.status(500).json({ msg: "Error updating donation status", error: err });
  }
};

const confirmPickup = async (req, res) => {
  try {
    const { id } = req.params;

    const donation = await Donation.findByIdAndUpdate(
      id,
      { status: "completed" },
      { new: true }
    );

    if (!donation) {
      return res.status(404).json({ msg: "Donation not found" });
    }

    res
      .status(200)
      .json({ msg: "Donation status marked as completed", donation });
  } catch (err) {
    res.status(500).json({ msg: "Error confirming pickup", error: err });
  }
};

const needVolunteer = async (req, res) => {
  const { id } = req.params;
  console.log(id);
  try {
    const donation = await Donation.findById(id);
    if (!donation) {
      return res.status(404).json({ msg: "Donation not found" });
    }

    donation.needVolunteer = true;
    await donation.save();
    res
      .status(200)
      .json({ msg: "Donation marked as needing volunteer", donation });
  } catch (err) {
    res.status(500).json({ msg: "Error updating needVolunteer", error: err });
  }
};

// Controller to handle donation updates
const donate = async (req, res) => {
  try {
    const { quantityDonated } = req.body; // Get quantity donated from the request body
    const { requestId } = req.params; // Get the request ID from params

    // Find the request by ID
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    let remainingQuantity = request.quantity - quantityDonated;

    // Update the request with the remaining quantity or deactivate if fully donated
    if (remainingQuantity > 0) {
      request.quantity = remainingQuantity;
      request.isActive = true; // Keep the request active
      await request.save();
      return res.json({
        message: "Donation successfully added",
        remainingQuantity,
      });
    } else {
      request.quantity = 0;
      request.isActive = false; // Deactivate the request if fully donated
      await request.save();
      return res.json({
        message: "Donation fully completed, request closed",
        remainingQuantity: 0,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};
const getActiveRequests = async (req, res) => {
  try {
    const requests = await Request.find({ isActive: true });

    const organizations = await User.find({ role: "receiver", isActive: true });

    console.log("Requests:", requests);
    console.log("Organizations:", organizations);

    res
      .status(200)
      .json({
        msg: "Retrieved Active requests successfully",
        requests,
        organizations,
      });
  } catch (error) {
    console.error("Error finding requests:", error); // Add detailed logging for debugging
    res.status(400).json({ msg: "Error finding requests", error });
  }
};
module.exports = {
  postDonation,
  deleteDonation,
  acceptDonation,
  getDonations,
  assignVolunteer,
  donarAccept,
  donate,
  updateDonationStatus,
  markAsSelfVolunteer,
  confirmPickup,
  needVolunteer,
  getActiveRequests,
};
