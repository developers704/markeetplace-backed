const PresidentSignature = require('../models/presidentSignature.model');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Upload/Update President Signature
const uploadPresidentSignature = async (req, res) => {
  try {
    const presidentId = req.user.id;

    // Check if signature file is uploaded
    if (!req.files || !req.files.presidentSignature || req.files.presidentSignature.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'President signature image is required'
      });
    }

    const newSignaturePath = req.files.presidentSignature[0].path.replace(/\\/g, '/');

    // Check if president already has a signature
    const existingSignature = await PresidentSignature.findOne({ presidentId });

    if (existingSignature) {
      // Delete old signature file
      if (fs.existsSync(existingSignature.signaturePath)) {
        fs.unlinkSync(existingSignature.signaturePath);
      }

      // Update existing signature
      existingSignature.signaturePath = newSignaturePath;
      existingSignature.updatedAt = new Date();
      await existingSignature.save();

      return res.status(200).json({
        success: true,
        message: 'President signature updated successfully',
        signature: {
          id: existingSignature._id,
          signaturePath: existingSignature.signaturePath,
          uploadedAt: existingSignature.uploadedAt,
          updatedAt: existingSignature.updatedAt
        }
      });
    } else {
      // Create new signature record
      const newSignature = new PresidentSignature({
        presidentId,
        signaturePath: newSignaturePath
      });

      await newSignature.save();

      return res.status(201).json({
        success: true,
        message: 'President signature uploaded successfully',
        signature: {
          id: newSignature._id,
          signaturePath: newSignature.signaturePath,
          uploadedAt: newSignature.uploadedAt
        }
      });
    }

  } catch (error) {
    console.error('Error uploading president signature:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload president signature',
      error: error.message
    });
  }
};

// Get President Signature
const getPresidentSignature = async (req, res) => {
  try {
    const presidentId = req.user.id;

    const signature = await PresidentSignature.findOne({ 
      presidentId, 
      isActive: true 
    }).populate('presidentId', 'username email'); // 🆕 Add fields you want

    // console.log(signature);

    if (!signature) {
      return res.status(404).json({
        success: false,
        message: 'President signature not found. Please upload signature first.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'President signature retrieved successfully',
      signature: {
        id: signature._id,
        presidentName: signature.presidentId.username, // 🆕 President name
        presidentEmail: signature.presidentId.email,   // 🆕 President email
        signaturePath: signature.signaturePath,
        uploadedAt: signature.uploadedAt,
        updatedAt: signature.updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting president signature:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get president signature',
      error: error.message
    });
  }
};

// Delete President Signature
const deletePresidentSignature = async (req, res) => {
  try {
    const presidentId = req.user.id;

    const signature = await PresidentSignature.findOne({ presidentId });

    if (!signature) {
      return res.status(404).json({
        success: false,
        message: 'President signature not found'
      });
    }

    // Delete signature file
    if (fs.existsSync(signature.signaturePath)) {
      fs.unlinkSync(signature.signaturePath);
    }

    // Delete from database
    await PresidentSignature.findByIdAndDelete(signature._id);

    res.status(200).json({
      success: true,
      message: 'President signature deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting president signature:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete president signature',
      error: error.message
    });
  }
};

module.exports = {
  uploadPresidentSignature,
  getPresidentSignature,
  deletePresidentSignature
};
