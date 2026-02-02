const Course = require('../models/course.model');
const mongoose = require('mongoose');
const Customer = require('../models/customer.model');
const Quiz = require('../models/quiz.model');
const { sendCourseAssignmentEmails } = require('../helpers/courseAssignmentHelper.js');
const Warehouse = require('../models/warehouse.model.js');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// ============================================================================
// Bunny Stream Video Library Configuration
// ============================================================================
const BUNNY_LIBRARY_ID = '589566';
const BUNNY_API_KEY = '258531ca-27bd-46bc-a91ff5bea140-9be6-4d9f';
const BUNNY_CDN_HOSTNAME = 'vz-95f84657-308.b-cdn.net'; // CDN hostname from Bunny Stream dashboard
const BUNNY_API_BASE_URL = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}`;

/**
 * Poll Bunny Stream API until video processing is complete
 * 
 * @param {string} videoGuid - Bunny Stream video GUID
 * @param {number} maxAttempts - Maximum polling attempts (default: 30 = 60 seconds)
 * @param {number} pollInterval - Polling interval in milliseconds (default: 2000 = 2 seconds)
 * @returns {Promise<Object>} - Video details object with HLS URL
 * @throws {Error} - If video doesn't process within maxAttempts
 */


/**
 * Extract HLS URL from Bunny Stream video details
 * 
 * @param {Object} videoDetails - Video details object from Bunny Stream API
 * @param {string} videoGuid - Video GUID for error messages
 * @returns {string} - HLS streaming URL (.m3u8)
 * @throws {Error} - If HLS URL is not found
 */

/**
 * Upload video file to Bunny Stream and return HLS URL
 * 
 * This function:
 * 1. Creates a video entry in Bunny Stream to get a GUID
 * 2. Uploads the actual video file to that entry
 * 3. Waits for Bunny Stream to process the video (polls until ready)
 * 4. Extracts HLS URL from video details
 * 5. Returns ONLY HLS URL (never MP4 fallback)
 * 
 * @param {string} filePath - Local file path of the video
 * @param {string} fileName - Original filename
 * @returns {Promise<string>} - HLS streaming URL (.m3u8)
 * @throws {Error} - If upload fails or HLS URL is not available
 */
async function uploadVideoToBunny(filePath, fileName) {
  let videoGuid;

  try {
    // 1️⃣ Create video
    const createRes = await axios.post(
      `${BUNNY_API_BASE_URL}/videos`,
      { title: fileName },
      { headers: { AccessKey: BUNNY_API_KEY } }
    );

    videoGuid = createRes.data.guid;
    if (!videoGuid) throw new Error('GUID not returned');

    // 2️⃣ Upload binary
    const stream = fs.createReadStream(filePath);
    const { size } = fs.statSync(filePath);

    await axios.put(
      `${BUNNY_API_BASE_URL}/videos/${videoGuid}`,
      stream,
      {
        headers: {
          AccessKey: BUNNY_API_KEY,
          'Content-Type': 'application/octet-stream',
          'Content-Length': size
        },
        maxBodyLength: Infinity
      }
    );

    // 3️⃣ WAIT FOR HLS
    const { hlsUrl } = await pollBunnyStreamUntilHlsReady(videoGuid);

    return hlsUrl;

  } catch (err) {
    throw new Error(
      `Bunny upload failed (${videoGuid || 'no-guid'}): ${err.message}`
    );
  }
}


/**
 * Poll Bunny Stream API until video processing is complete
 * 
 * @param {string} videoGuid - Bunny Stream video GUID
 * @param {number} maxAttempts - Maximum polling attempts (default: 30 = 60 seconds)
 * @param {number} pollInterval - Polling interval in milliseconds (default: 2000 = 2 seconds)
 * @returns {Promise<Object>} - Video details object with HLS URL
 * @throws {Error} - If video doesn't process within maxAttempts
 */

async function pollBunnyStreamUntilHlsReady(
  videoGuid,
  maxAttempts = 30,     // 60 seconds (30 * 2 seconds)
  pollInterval = 2000   // 2 seconds
) {
  let lastStatus = null;
  let lastData = null;

  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval));

    const { data } = await axios.get(
      `${BUNNY_API_BASE_URL}/videos/${videoGuid}`,
      { headers: { AccessKey: BUNNY_API_KEY } }
    );

    lastStatus = data.status;
    lastData = data;

    // Try multiple ways to get HLS URL
    let hls = data.playbackUrls?.hls || 
              data.hlsUrl || 
              data.hls ||
              data.playbackUrls?.hlsUrl;

    console.log(`[Bunny Stream Polling] Attempt ${i}/${maxAttempts} - Status: ${data.status}, HLS URL: ${hls || 'not found'}`);

    // Check if video is processed (status 4 = Complete, status 3 = Finished but might still be processing)
    const isProcessed = data.status === 4 || data.status === 'Finished' || data.status === 'Complete';
    
    // If HLS URL is available, return it (even if status is 3, sometimes HLS is ready)
    if (hls && (hls.includes('.m3u8') || hls.includes('playlist.m3u8'))) {
      console.log(`✅ HLS URL found after ${i} attempts (status: ${data.status})`);
      return { videoDetails: data, hlsUrl: hls };
    }

    // If status is 4 (Complete) but HLS URL not in response, try to construct it
    if (data.status === 4 && !hls) {
      // Construct HLS URL from video GUID using the correct CDN hostname
      // Bunny Stream format: https://{cdnHostname}/{videoGuid}/playlist.m3u8
      const constructedHls = `https://${BUNNY_CDN_HOSTNAME}/${videoGuid}/playlist.m3u8`;
      console.log(`[Bunny Stream] Status 4 but HLS not in response, constructing: ${constructedHls}`);
      return { videoDetails: data, hlsUrl: constructedHls };
    }

    // Continue polling if not ready
    if (i < maxAttempts) {
      console.log(`[Bunny Stream Polling] Video still processing... (status: ${data.status}, encodeProgress: ${data.encodeProgress || 'N/A'}%)`);
    }
  }

  // If we get here, video didn't process in time
  // Try to construct HLS URL as fallback if status is 3 or 4
  // Status 3 = Finished/Encoded, Status 4 = Complete
  // Even if HLS URL is not in response, we can construct it
  if (lastStatus === 3 || lastStatus === 4) {
    // Construct HLS URL from video GUID using the correct CDN hostname
    // Bunny Stream format: https://{cdnHostname}/{videoGuid}/playlist.m3u8
    const constructedHls = `https://${BUNNY_CDN_HOSTNAME}/${videoGuid}/playlist.m3u8`;
    console.log(`[Bunny Stream] Status ${lastStatus} reached but HLS not in response, constructing URL: ${constructedHls}`);
    return { videoDetails: lastData, hlsUrl: constructedHls };
  }

  // If status is 2 (Processing) with high progress, try constructing URL
  // Some videos have HLS available even during processing
  if (lastStatus === 2 && lastData?.encodeProgress && lastData.encodeProgress > 50) {
    const constructedHls = `https://${BUNNY_CDN_HOSTNAME}/${videoGuid}/playlist.m3u8`;
    console.log(`[Bunny Stream] Status 2 with ${lastData.encodeProgress}% progress, trying constructed URL: ${constructedHls}`);
    return { videoDetails: lastData, hlsUrl: constructedHls };
  }

  throw new Error(
    `HLS not ready after ${maxAttempts} attempts. Last status=${lastStatus}, encodeProgress=${lastData?.encodeProgress || 'N/A'}%`
  );
}


/**
 * Extract HLS URL from Bunny Stream video details
 * 
 * @param {Object} videoDetails - Video details object from Bunny Stream API
 * @param {string} videoGuid - Video GUID for error messages
 * @returns {string} - HLS streaming URL (.m3u8)
 * @throws {Error} - If HLS URL is not found
 */



/**
 * Update MongoDB Course document with HLS URLs for specific content items
 * 
 * @param {string} courseId - MongoDB Course document ID
 * @param {Array} videoUpdates - Array of update objects: [{ chapterIndex, sectionIndex, contentIndex, hlsUrl }]
 * @returns {Promise<Object>} - Updated Course document
 * @throws {Error} - If course not found or update fails
 */
async function updateCourseVideoUrls(courseId, videoUpdates) {
  console.log(`[MongoDB Update] Updating course ${courseId} with ${videoUpdates.length} video URL(s)...`);
  
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error('Course not found');
  }

  // Build MongoDB update query using dot notation
  const updateQuery = {};
  let updateCount = 0;

  for (const update of videoUpdates) {
    const { chapterIndex, sectionIndex, contentIndex, hlsUrl } = update;
    
    // Validate indices
    if (chapterIndex < 0 || sectionIndex < 0 || contentIndex < 0) {
      console.warn(`[MongoDB Update] Skipping invalid indices: chapter=${chapterIndex}, section=${sectionIndex}, content=${contentIndex}`);
      continue;
    }

    // Check if indices are within bounds
    if (chapterIndex >= course.chapters.length) {
      console.warn(`[MongoDB Update] Chapter index ${chapterIndex} out of bounds (course has ${course.chapters.length} chapters)`);
      continue;
    }

    const chapter = course.chapters[chapterIndex];
    if (sectionIndex >= chapter.sections.length) {
      console.warn(`[MongoDB Update] Section index ${sectionIndex} out of bounds (chapter has ${chapter.sections.length} sections)`);
      continue;
    }

    const section = chapter.sections[sectionIndex];
    if (contentIndex >= section.content.length) {
      console.warn(`[MongoDB Update] Content index ${contentIndex} out of bounds (section has ${section.content.length} content items)`);
      continue;
    }

    // Build dot notation path for MongoDB update
    const path = `chapters.${chapterIndex}.sections.${sectionIndex}.content.${contentIndex}.videoUrl`;
    updateQuery[path] = hlsUrl;
    updateCount++;

    console.log(`[MongoDB Update] Setting ${path} = ${hlsUrl}`);
  }

  if (updateCount === 0) {
    console.warn('[MongoDB Update] No valid video URLs to update');
    return course;
  }

  // Perform bulk update
  const updatedCourse = await Course.findByIdAndUpdate(
    courseId,
    { $set: updateQuery },
    { new: true, runValidators: true }
  );

  if (!updatedCourse) {
    throw new Error('Failed to update course in MongoDB');
  }

  console.log(`[MongoDB Update] ✅ Successfully updated ${updateCount} video URL(s) in course ${courseId}`);
  return updatedCourse;
}

/**
 * Process and upload multiple videos from req.files to Bunny Stream
 * Maps video files to course content items and updates MongoDB with HLS URLs
 * 
 * This function:
 * 1. Extracts video files from req.files based on fieldname pattern
 * 2. Maps files to course content items (chapter → section → content)
 * 3. Uploads each video to Bunny Stream
 * 4. Polls until HLS URL is available for each video
 * 5. Updates MongoDB Course document with HLS URLs (if courseId provided)
 * 6. Returns updated chapters with HLS URLs
 * 
 * @param {Object} req - Express request object with req.files and req.body
 * @param {string} courseId - MongoDB Course document ID (for updates) or null (for creates)
 * @param {Array} chapters - Parsed chapters array from req.body
 * @returns {Promise<Object>} - Object with updated chapters and upload results
 * @throws {Error} - If upload fails or HLS URL is missing
 */
async function processAndUploadCourseVideos(req, courseId, chapters) {
  console.log('[Video Processing] ========================================');
  console.log('[Video Processing] Starting video upload process...');
  console.log(`[Video Processing] Course ID: ${courseId || 'NEW'}, Chapters: ${chapters?.length || 0}`);

  if (!req.files || req.files.length === 0) {
    console.log('[Video Processing] No files uploaded, skipping video processing');
    return {
      chapters: chapters,
      uploadResults: [],
      errors: [],
      totalVideos: 0,
      successCount: 0,
      errorCount: 0
    };
  }

  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
    console.log('[Video Processing] No chapters provided, skipping video processing');
    return {
      chapters: chapters,
      uploadResults: [],
      errors: [],
      totalVideos: 0,
      successCount: 0,
      errorCount: 0
    };
  }

  // ========================================================================
  // STEP 1: Map uploaded files to content items
  // ========================================================================
  console.log('[Video Processing] Step 1: Mapping uploaded files to content items...');
  
  const fileMap = {};
  req.files.forEach(file => {
    // Handle both exact match and with trailing space
    fileMap[file.fieldname] = file;
    fileMap[`${file.fieldname} `] = file;
  });

  const videoUploadTasks = [];
  const videoUpdates = [];

  // ========================================================================
  // STEP 2: Identify all video content items that need uploads
  // ========================================================================
  console.log('[Video Processing] Step 2: Identifying video content items...');
  
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapter = chapters[chapterIndex];
    
    if (!chapter.sections || !Array.isArray(chapter.sections)) {
      continue;
    }

    for (let sectionIndex = 0; sectionIndex < chapter.sections.length; sectionIndex++) {
      const section = chapter.sections[sectionIndex];
      
      if (!section.content || !Array.isArray(section.content)) {
        continue;
      }

      for (let contentIndex = 0; contentIndex < section.content.length; contentIndex++) {
        const content = section.content[contentIndex];
        
        // Only process video content
        if (content.contentType !== 'video') {
          continue;
        }

        // Check if a video file was uploaded for this content item
        const videoFieldName = `chapter_video_${chapterIndex}_section_${sectionIndex}_content_${contentIndex}`;
        const videoFile = fileMap[videoFieldName] || fileMap[`${videoFieldName} `];

        if (!videoFile) {
          // No file uploaded for this content item, skip
          // Keep existing videoUrl if present
          continue;
        }

        console.log(`[Video Processing] Found video file for Chapter ${chapterIndex + 1}, Section ${sectionIndex + 1}, Content ${contentIndex + 1}: ${videoFile.originalname}`);

        // Create upload task
        const uploadTask = {
          chapterIndex,
          sectionIndex,
          contentIndex,
          videoFile,
          contentTitle: content.title || 'Untitled Video'
        };

        videoUploadTasks.push(uploadTask);
      }
    }
  }

  if (videoUploadTasks.length === 0) {
    console.log('[Video Processing] No video files found in request, skipping uploads');
    
    // Count existing videos
    let totalVideos = 0;
    chapters.forEach(chapter => {
      if (chapter.sections) {
        chapter.sections.forEach(section => {
          if (section.content) {
            section.content.forEach(content => {
              if (content.contentType === 'video' && content.videoUrl) {
                totalVideos++;
              }
            });
          }
        });
      }
    });
    
    return {
      chapters: chapters,
      uploadResults: [],
      errors: [],
      totalVideos: totalVideos,
      successCount: 0,
      errorCount: 0
    };
  }

  console.log(`[Video Processing] Step 2 Complete: Found ${videoUploadTasks.length} video file(s) to upload`);

  // ========================================================================
  // STEP 3: Upload videos to Bunny Stream (sequential to avoid rate limits)
  // ========================================================================
  console.log('[Video Processing] Step 3: Uploading videos to Bunny Stream...');
  const uploadResults = [];
  const errors = [];

  for (let i = 0; i < videoUploadTasks.length; i++) {
    const task = videoUploadTasks[i];
    const { chapterIndex, sectionIndex, contentIndex, videoFile, contentTitle } = task;

    console.log(`[Video Processing] [${i + 1}/${videoUploadTasks.length}] Uploading: "${contentTitle}" (${videoFile.originalname})`);

    try {
      // Upload video to Bunny Stream and get HLS URL
      const hlsUrl = await uploadVideoToBunny(videoFile.path, videoFile.originalname);

      console.log(`[Video Processing] [${i + 1}/${videoUploadTasks.length}] ✅ Upload successful. HLS URL: ${hlsUrl}`);

      // Update the content item in memory
      chapters[chapterIndex].sections[sectionIndex].content[contentIndex].videoUrl = hlsUrl;

      // Store update for MongoDB
      videoUpdates.push({
        chapterIndex,
        sectionIndex,
        contentIndex,
        hlsUrl
      });

      uploadResults.push({
        success: true,
        chapterIndex,
        sectionIndex,
        contentIndex,
        contentTitle,
        hlsUrl,
        fileName: videoFile.originalname
      });

    } catch (uploadError) {
      console.error(`[Video Processing] [${i + 1}/${videoUploadTasks.length}] ❌ Upload failed:`, uploadError.message);

      errors.push({
        chapterIndex,
        sectionIndex,
        contentIndex,
        contentTitle,
        fileName: videoFile.originalname,
        error: uploadError.message
      });

      // Continue with other videos even if one fails
      // But we'll return errors at the end
    }
  }

  console.log(`[Video Processing] Step 3 Complete: ${uploadResults.length} successful, ${errors.length} failed`);

  // ========================================================================
  // STEP 4: Update MongoDB if courseId is provided (for updates)
  // ========================================================================
  if (courseId && videoUpdates.length > 0) {
    try {
      console.log(`[Video Processing] Step 4: Updating MongoDB course ${courseId} with ${videoUpdates.length} HLS URL(s)...`);
      await updateCourseVideoUrls(courseId, videoUpdates);
      console.log(`[Video Processing] Step 4 Complete: ✅ MongoDB updated successfully`);
    } catch (mongoError) {
      console.error(`[Video Processing] Step 4 Failed: ❌ MongoDB update error:`, mongoError.message);
      // Don't fail the entire request if MongoDB update fails
      // The HLS URLs are already in the chapters array, so they'll be saved on the main update
    }
  } else if (!courseId) {
    console.log(`[Video Processing] Step 4: Skipping MongoDB update (new course, will be saved after creation)`);
  }

  // ========================================================================
  // STEP 5: Count total videos (including existing ones)
  // ========================================================================
  let totalVideos = 0;
  chapters.forEach(chapter => {
    if (chapter.sections) {
      chapter.sections.forEach(section => {
        if (section.content) {
          section.content.forEach(content => {
            if (content.contentType === 'video' && content.videoUrl) {
              totalVideos++;
            }
          });
        }
      });
    }
  });

  console.log(`[Video Processing] Step 5: Total videos in course: ${totalVideos}`);

  // ========================================================================
  // STEP 6: Return results
  // ========================================================================
  if (errors.length > 0) {
    console.warn(`[Video Processing] ⚠️ Completed with ${errors.length} error(s)`);
  } else {
    console.log(`[Video Processing] ✅ All videos processed successfully`);
  }
  
  console.log('[Video Processing] ========================================');

  return {
    chapters: chapters,
    uploadResults: uploadResults,
    errors: errors,
    totalVideos: totalVideos,
    successCount: uploadResults.length,
    errorCount: errors.length
  };
}

const createCourse = async (req, res) => {
  try {
    // console.log('Received request to create course:', req.body);
    // console.log('Received request files:', req.files);
    const {
      name,
      description,
      approximateHours,
      courseDuration,
      courseType,
      // level,
      // language,
      sequence,
      passingGrade,
      accessControl,
      chapters
    } = req.body;

    const level = req.body.level || req.body['level '] || req.body.levelValue;
    const language = req.body.language || req.body['language '] || req.body.languageValue;

    // Validate required fields
    // if (!name || !approximateHours || !level || !language || !sequence) {
    //   return res.status(400).json({
    //     message: 'Missing required course fields',
    //     missing: {
    //       name: !name,
    //       // description: !description,
    //       approximateHours: !approximateHours,
    //       level: !level,
    //       language: !language,
    //       sequence: !sequence
    //     }
    //   });
    // }
    // Check if files array exists and if courseThumbnail exists
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files were uploaded' });
    }

    // Find the course thumbnail in the files array
    const courseThumbnailFile = req.files.find(file => file.fieldname === 'courseThumbnail');
    if (!courseThumbnailFile) {
      return res.status(400).json({ message: 'Course thumbnail is required' });
    }

    // Process course thumbnail
    const thumbnailPath = courseThumbnailFile.path.replace(/\\/g, '/');

    // Parse chapters data (assuming it's sent as JSON string)
    let parsedChapters = [];
    if (typeof chapters === 'string') {
      parsedChapters = JSON.parse(chapters);
    } else {
      parsedChapters = chapters;
    }

    // Process and validate chapters
    if (!parsedChapters || !Array.isArray(parsedChapters) || parsedChapters.length === 0) {
      return res.status(400).json({ message: 'At least one chapter is required' });
    }

    // Count total videos
    let totalVideos = 0;

    // Process chapters and their content
    const processedChapters = [];

    for (let i = 0; i < parsedChapters.length; i++) {
      const chapter = parsedChapters[i];

      // if (!chapter.title || !chapter.sequence || !chapter.sections || !Array.isArray(chapter.sections)) {
      //   return res.status(400).json({ message: `Chapter ${i + 1} is missing required fields` });
      // }

      const processedSections = [];

      for (let j = 0; j < chapter.sections.length; j++) {
        const section = chapter.sections[j];

        if (!section.title || !section.sequence) {
          return res.status(400).json({ message: `Section ${j + 1} in Chapter ${i + 1} is missing required fields` });
        }

        const processedContent = [];

        if (section.content && Array.isArray(section.content)) {
          for (let k = 0; k < section.content.length; k++) {
            const content = section.content[k];

            if (!content.title || !content.contentType || !content.sequence) {
              return res.status(400).json({ message: `Content item ${k + 1} in Section ${j + 1}, Chapter ${i + 1} is missing required fields` });
            }

            const processedContentItem = {
              ...content
            };

            // Process video content
            // Note: Video uploads are handled by processAndUploadCourseVideos function
            // This section only processes thumbnails
            if (content.contentType === 'video') {
              const thumbnailFieldName = `content_thumbnail_${i}_section_${j}_content_${k}`;

              // Find the thumbnail file in the files array (optional) - handle potential spaces in fieldname
              const thumbnailFile = req.files.find(file =>
                file.fieldname === thumbnailFieldName ||
                file.fieldname === `${thumbnailFieldName} ` // Handle trailing space
              );

              if (thumbnailFile) {
                processedContentItem.thumbnail = thumbnailFile.path.replace(/\\/g, '/');
              }

              // Keep existing videoUrl if present (for updates)
              if (content.videoUrl) {
                processedContentItem.videoUrl = content.videoUrl;
              }
            }

            processedContent.push(processedContentItem);
          }
        }

        const processedSection = {
          ...section,
          content: processedContent
        };

        // If there's a quiz reference, store it
        if (section.quizId) {
          processedSection.quiz = section.quizId;
        }

        processedSections.push(processedSection);
      }

      processedChapters.push({
        ...chapter,
        sections: processedSections,
        deadline: chapter.deadline
      });
    }

    // ========================================================================
    // STEP: Process and upload videos to Bunny Stream
    // ========================================================================
    console.log('[Course Creation] Processing video uploads to Bunny Stream...');
    const videoProcessingResult = await processAndUploadCourseVideos(
      req,
      null, // courseId is null for new courses (will be created after)
      processedChapters
    );

    // Update processedChapters with HLS URLs from video processing
    // Note: processedChapters is const, so we use the result directly
    const finalChapters = videoProcessingResult.chapters;
    const finalTotalVideos = videoProcessingResult.totalVideos;

    // Check for upload errors
    if (videoProcessingResult.errors && videoProcessingResult.errors.length > 0) {
      const firstError = videoProcessingResult.errors[0];
      return res.status(500).json({
        success: false,
        message: `Failed to upload video: ${firstError.contentTitle}`,
        error: firstError.error,
        contentTitle: firstError.contentTitle,
        chapterIndex: firstError.chapterIndex + 1,
        sectionIndex: firstError.sectionIndex + 1,
        contentIndex: firstError.contentIndex + 1,
        allErrors: videoProcessingResult.errors
      });
    }

    console.log(`[Course Creation] ✅ Video processing complete. ${videoProcessingResult.successCount || 0} video(s) uploaded, ${finalTotalVideos} total videos in course`);

    // Parse access control
    // Parse access control
    let parsedAccessControl = { roles: [], stores: [] };
    if (typeof accessControl === 'string') {
      parsedAccessControl = JSON.parse(accessControl);
    } else if (accessControl) {
      // If accessControl is provided as form fields
      if (accessControl.roles) {
        // Convert role IDs to ObjectId if they're valid MongoDB IDs
        parsedAccessControl.roles = Array.isArray(accessControl.roles)
          ? accessControl.roles.map(roleId => {
            // Check if it's a valid MongoDB ObjectId
            if (mongoose.Types.ObjectId.isValid(roleId)) {
              return new mongoose.Types.ObjectId(roleId); // Add 'new' keyword here
            }
            return roleId;
          })
          : [accessControl.roles];
      }

      if (accessControl.stores) {
        // Convert store IDs to ObjectId
        parsedAccessControl.stores = Array.isArray(accessControl.stores)
          ? accessControl.stores.map(storeId => new mongoose.Types.ObjectId(storeId)) // Add 'new' keyword here
          : [new mongoose.Types.ObjectId(accessControl.stores)]; // Add 'new' keyword here
      }
    }




    // Create the course
    const newCourse = new Course({
      name,
      // description,
      courseType,
      courseDuration,
      thumbnail: thumbnailPath,
      approximateHours,
      level,
      language,
      sequence,
      passingGrade: passingGrade || 70,
      accessControl: parsedAccessControl,
      chapters: finalChapters,
      totalVideos: finalTotalVideos,
      isActive: true
    });

    await newCourse.save();

    console.log('✅ Course created successfully, now sending notifications...');


    try {
      const notificationResult = await sendCourseAssignmentEmails(newCourse, 'create');
      console.log('📧 Notification result:', notificationResult);
    } catch (notificationError) {
      console.error('❌ Error sending notifications:', notificationError);
      // Don't fail the course creation if notifications fail
    }



    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      course: {
        id: newCourse._id,
        name: newCourse.name,
        totalChapters: newCourse.chapters.length,
        totalVideos: newCourse.totalVideos
      }
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create course',
      error: error.message
    });
  }
};


// get simplified course:
const getAllCoursesSimplified = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true })
      .select('_id name chapters.title chapters._id chapters.sections.title chapters.sections._id')
      .lean();

    const simplifiedCourses = courses.map(course => ({
      courseId: course._id,
      courseName: course.name,
      courseDuration: course.courseDuration,
      chapters: course.chapters.map(chapter => ({
        chapterId: chapter._id,
        chapterName: chapter.title,
        sections: chapter.sections.map(section => ({
          sectionId: section._id,
          sectionName: section.title
        }))
      }))
    }));

    res.status(200).json({
      success: true,
      message: 'Courses retrieved successfully',
      data: simplifiedCourses
    });

  } catch (error) {
    console.error('Error fetching simplified courses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch courses',
      error: error.message
    });
  }
};



// new route get course login user:
const getCustomerCourses = async (req, res) => {
  try {
    const customerId = req.user.id; // From auth middleware
    const warehouseID = req?.user?.selectedWarehouse;

    // Get customer details with role and warehouse
    const customer = await Customer.findById(customerId)
      .populate('role')
      .populate('warehouse');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Find courses accessible to customer's role and warehouse
    const accessibleCourses = await Course.find({
      isActive: true,
      courseType: 'Course',
      $and: [
        {
          $or: [
            { 'accessControl.roles': customer.role._id },
            { 'accessControl.roles': { $size: 0 } } // If no roles specified, accessible to all
          ]
        },
        {
          $or: [
            { 'accessControl.stores': warehouseID },
            { 'accessControl.stores': { $size: 0 } } // If no stores specified, accessible to all
          ]
        }
      ]
    }).sort({ sequence: 1 }); // Sort by sequence order

    // Process each course to determine unlock status
    const processedCourses = await Promise.all(
      accessibleCourses.map(async (course, index) => {
        const courseObj = course.toObject();

        // Find user's enrollment in this course
        const userEnrollment = course.enrolledUsers.find(
          enrollment => enrollment.user.toString() === customerId
        );

        // Default status is locked
        let status = 'Locked';
        let canAccess = false;

        // First course (sequence 1 or index 0) should be unlocked
        if (index === 0) {
          canAccess = true;
          status = userEnrollment
            ? (userEnrollment.progress === 100 || userEnrollment.status === 'Completed' || userEnrollment.status === 'Done'
                ? 'Completed'
                : (userEnrollment.progress > 0 ? 'In Progress' : 'Unlocked'))
            : 'Unlocked';
        } else {
          // Check if previous course is completed (content completion unlocks next course)
          const previousCourse = accessibleCourses[index - 1];
          const previousEnrollment = previousCourse.enrolledUsers.find(
            enrollment => enrollment.user.toString() === customerId
          );

          // Course is completed if:
          // 1) Progress is 100% OR
          // 2) Status is 'Completed' / 'Done'
          // const isPreviousCourseCompleted = previousEnrollment && (
          //   previousEnrollment.progress === 100 ||
          //   previousEnrollment.status === 'Completed' ||
          //   previousEnrollment.status === 'Done'
          // );

          const isPreviousCourseCompleted = previousEnrollment && isCourseActuallyCompleted(previousCourse, previousEnrollment);

          if (isPreviousCourseCompleted) {
            canAccess = true;
            status = userEnrollment ?
              (userEnrollment.status === 'Completed' ? 'Completed' : 'In Progress') :
              'Unlocked';
          }
        }

        // If enrolled, refine status
        if (userEnrollment) {
          if (userEnrollment.status === 'Done') {
            status = 'Completed';
          } else if (userEnrollment.progress === 100 || userEnrollment.status === 'Completed') {
            status = 'Completed';
          } else if (userEnrollment.progress > 0) {
            status = canAccess ? 'In Progress' : 'Locked';
          } else if (canAccess) {
            status = 'Unlocked';
          }
        }

        return {
          ...courseObj,
          status,
          canAccess,
          userProgress: userEnrollment ? {
            progress: userEnrollment.progress,
            gradePercentage: userEnrollment.gradePercentage,
            gradeLabel: userEnrollment.gradeLabel,
            certificateEarned: userEnrollment.certificateEarned,
            completionDate: userEnrollment.completionDate,
            status: userEnrollment.status
          } : null
        };
      })
    );

    res.status(200).json({
      success: true,
      data: processedCourses,
      message: 'Courses retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching customer courses:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const isCourseActuallyCompleted = (course, userEnrollment) => {
  if (!userEnrollment) return false;

  // Overall progress
  if (userEnrollment.progress < 100) return false;

  // Last chapter
  const lastChapter = course.chapters?.[course.chapters.length - 1];
  if (!lastChapter) return false;

  // Enrollment for last chapter
  const chapterEnrollment = userEnrollment.chapterProgress?.find(
    ch => ch.chapterId.toString() === lastChapter._id.toString()
  );
  if (!chapterEnrollment) return false;

  // Check all sections completed
  // const allSectionsCompleted = chapterEnrollment.sectionProgress?.every(
  //   sec => sec.completed === true
  // );
  // if (!allSectionsCompleted) return false;

  // Check quiz attempted
  const quizAttempted = lastChapter.quiz
    ? chapterEnrollment.quizProgress?.attempts >= 1
    : true;
  if (!quizAttempted) return false;

  return true;
};




// new controller 
// Get course chapters and sections with unlock status
const getCourseChaptersAndSections = async (req, res) => {
  try {
    const { courseId } = req.params;
    const customerId = req.user.id;
    const warehouseID = req?.user?.selectedWarehouse;

    const customer = await Customer.findById(customerId)
      .populate('role')
      .populate('warehouse');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // HIGHLIGHTED CHANGE: Populate chapter.quiz field directly
    const course = await Course.findById(courseId)
      .populate({
        path: 'chapters.quiz',        // ← POPULATE CHAPTER-LEVEL QUIZ
        model: 'Quiz',
        select: 'title timeLimit maxAttempts passingScore' // optional: only needed fields
      })
      .populate({
        path: 'chapters.sections.quiz', // keep old section quiz if any (backward compatibility)
        model: 'Quiz'
      });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Access control check (same as before)
    const hasRoleAccess = course.accessControl.roles.length === 0 ||
      course.accessControl.roles.some(roleId => roleId.toString() === customer.role._id.toString());

    const hasWarehouseAccess = course.accessControl.stores.length === 0 ||
      (customer.warehouse && course.accessControl.stores.some(storeId => storeId.toString() === warehouseID.toString()));

    if (!hasRoleAccess && !hasWarehouseAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this course'
      });
    }

    // Enrollment logic (same as before)
    let userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === customerId
    );

if (!userEnrollment) {
      const newEnrollment = {
        user: customerId,
        enrollmentDate: new Date(),
        status: 'Not Started', 
        progress: 0,
        currentChapter: 0,
        currentSection: 0,
        currentContent: 0,
        chapterProgress: course.chapters.map(chapter => ({
          chapterId: chapter._id,
          sequence: chapter.sequence,
          completed: false,
          sectionProgress: chapter.sections.map(section => ({
            sectionId: section._id,
            sequence: section.sequence,
            completed: false,
            contentProgress: section.content.map(content => ({
              contentId: content._id,
              sequence: content.sequence,
              watchedDuration: 0,
              completed: false
            })),
            quizProgress: null,
          }))
        })),
        overallGrade: 0,
        gradePercentage: 0,
        gradeLabel: 'Incomplete',
        allChaptersCompleted: false, // 🆕 ADD THIS
        allQuizzesPassed: false,     // 🆕 ADD THIS
        certificateEarned: false
      };

      // Add enrollment to course
      course.enrolledUsers.push(newEnrollment);
      await course.save();

      // Set userEnrollment to the newly created enrollment
      userEnrollment = newEnrollment;
    }

    // Get quiz results by chapterId
    const userQuizResults = await getUserQuizResults(courseId, customerId);

    // Process chapters — now includes chapter.quiz!
    const processedChapters = await processChaptersWithUnlockStatus(
      course.chapters,
      userEnrollment,
      userQuizResults
    );

    res.status(200).json({
      success: true,
      data: {
        courseId: course._id,
        courseName: course.name,
        courseDuration: course.courseDuration,
        chapters: processedChapters
      },
      message: 'Course chapters and sections retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching course chapters:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};


// new controller section detail by section id
const getSectionDetails = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const customerId = req.user.id;

    // Fetch course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }


    // Check enrollment
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === customerId.toString()
    );
    

    console.log("user Enrollment", userEnrollment);
    console.log("user Enrollment", course);

    if (!userEnrollment) {
      return res.status(403).json({
        success: false,
        message: 'Not enrolled in this course',
      });
    }

    // === STEP 1: Find section and parent chapter ===
    let targetSection = null;
    let parentChapter = null;

    for (const chapter of course.chapters) {
      const found = chapter.sections.find(
        (s) => s._id.toString() === sectionId
      );
      if (found) {
        targetSection = found;
        parentChapter = chapter;
        break;
      }
    }

    // === STEP 2: Check if this is QUIZ-ONLY access (sectionId is actually quizId) ===
    let isQuizOnlyAccess = false;
    let quizDetails = null;

    if (!targetSection && sectionId.length === 24) {
      const chapterWithQuiz = course.chapters.find(
        (ch) => ch.quiz && ch.quiz.toString() === sectionId
      );

      if (chapterWithQuiz) {
        isQuizOnlyAccess = true;
        parentChapter = chapterWithQuiz;
      }
    }

    // === STEP 3: Load Quiz ONLY if needed ===
    if (parentChapter?.quiz) {
      const quiz = await Quiz.findById(parentChapter.quiz);
      if (quiz) {
        const userAttempts = quiz.attempts.filter(
          (a) => a.userId.toString() === customerId.toString()
        );

        const bestAttempt = userAttempts.length > 0
          ? userAttempts.reduce((best, curr) =>
              curr.percentage > best.percentage ? curr : best
            )
          : null;

        // Check if user can attempt quiz (content completion only; attempts are unlimited)
        let allContentCompleted = true;

        if (isQuizOnlyAccess) {
          // For quiz-only access: require all content in the chapter to be completed
          const userQuizResults = await getUserQuizResults(courseId, customerId);
          allContentCompleted = await isChapterCompleted(parentChapter, userQuizResults, userEnrollment);
        } else {
          // Normal section: require all content in the section to be completed
          allContentCompleted = isSectionCompleted(targetSection, {}, userEnrollment);
        }

        const canAttempt = allContentCompleted;

        // Shuffle questions if enabled
        let processedQuestions = quiz.questions.map((q, idx) => ({
          originalIndex: idx,
          question: q.question,
          options: q.options,
          points: q.points,
        }));

        if (quiz.enableSuffling) {
          for (let i = processedQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [processedQuestions[i], processedQuestions[j]] = [processedQuestions[j], processedQuestions[i]];
          }
        }

        quizDetails = {
          _id: quiz._id,
          title: quiz.title,
          description: quiz.description,
          timeLimit: quiz.timeLimit,
          // Attempts are unlimited (we keep maxAttempts in DB for admin visibility only)
          maxAttempts: null,
          attemptPolicy: 'unlimited',
          passingScore: quiz.passingScore,
          enableTimer: quiz.enableTimer ?? false,
          enableSuffling: quiz.enableSuffling ?? true,
          questionTimeLimit: quiz.questionTimeLimit || 30,
          totalQuestions: quiz.questions.length,
          userAttempts: {
            totalAttempts: userAttempts.length,
            remainingAttempts: null,
            bestScore: bestAttempt?.score || 0,
            bestPercentage: bestAttempt?.percentage || 0,
            bestGrade: bestAttempt?.grade || 'Not Attempted',
            passed: bestAttempt?.passed || false,
            lastAttemptDate: bestAttempt?.attemptDate || null,
          },
          canAttempt,
          allContentCompleted,
          questions: processedQuestions,
        };
      }
    }

    // === STEP 4: Return Response ===

    // Quiz-Only Access (when user clicks "Quiz" from sidebar)
    if (isQuizOnlyAccess) {
      return res.status(200).json({
        success: true,
        data: {
          _id: sectionId, // quizId
          title: 'Quiz',
          chapterId: parentChapter._id,
          chapterTitle: parentChapter.title,
          quiz: quizDetails,
          isQuiz: true, // Important flag for frontend
          canAccess: true,
        },
        message: 'Quiz loaded successfully',
      });
    }

    // Normal Section Access
    if (!targetSection) {
      return res.status(404).json({
        success: false,
        message: 'Section not found',
      });
    }

    // 🆕 CHECK SECTION ACCESS - Verify user can access this section
    const userQuizResults = await getUserQuizResults(courseId, customerId);
    const processedChapters = await processChaptersWithUnlockStatus(
      course.chapters,
      userEnrollment,
      userQuizResults
    );

    // Find the chapter and section in processed chapters
    const processedChapter = processedChapters.find(
      ch => ch._id.toString() === parentChapter._id.toString()
    );
    
    const processedSection = processedChapter?.sections?.find(
      sec => sec._id.toString() === targetSection._id.toString()
    );

    // Check if section is accessible
    if (!processedSection || !processedSection.canAccess) {
      return res.status(403).json({
        success: false,
        message: 'You cannot access this section. Please complete previous sections first. ',
        canAccess: false
      });
    }

    // 🧠 BLOCK ACCESS IF CHAPTER QUIZ EXISTS BUT NOT ATTEMPTED
      // if (parentChapter.quiz) {
      //   const quizResult = userQuizResults[parentChapter._id.toString()];

      //   if (!quizResult || quizResult.attempts === 0) {
      //     return res.status(403).json({
      //       success: false,
      //       message: 'Please attempt the chapter quiz to unlock next sections.',
      //       canAccess: false,
      //       reason: 'CHAPTER_QUIZ_NOT_ATTEMPTED'
      //     });
      //   }
      // }


    // Process content with progress (same as before)
    const sectionProgress = userEnrollment.chapterProgress
      .find((cp) => cp.chapterId.toString() === parentChapter._id.toString())
      ?.sectionProgress.find((sp) => sp.sectionId.toString() === targetSection._id.toString());

    const processedContent = targetSection.content
      .map((item) => {
        const userProgress = sectionProgress?.contentProgress.find(
          (cp) => cp.contentId.toString() === item._id.toString()
        );

        let status = 'Not Started';
        let watchProgress = 0;

        if (userProgress) {
          if (item.contentType === 'video') {
            watchProgress = item.duration
              ? Math.round((userProgress.watchedDuration / item.duration) * 100)
              : 0;
            if (userProgress.watchedDuration >= item.minimumWatchTime) {
              status = 'Completed';
            } else if (userProgress.watchedDuration > 0) {
              status = 'In Progress';
            }
          } else {
            status = userProgress.completed ? 'Completed' : 'In Progress';
            watchProgress = userProgress.completed ? 100 : 0;
          }
        }

        return {
          _id: item._id,
          contentType: item.contentType,
          title: item.title,
          sequence: item.sequence,
          description: item.description || '',
          ...(item.contentType === 'video' && {
            videoUrl: item.videoUrl,
            duration: item.duration,
            thumbnail: item.thumbnail,
            minimumWatchTime: item.minimumWatchTime,
            likes: item.likes || 0,
            dislikes: item.dislikes || 0,
          }),
          ...(item.contentType === 'text' && {
            textContent: item.textContent,
            likes: item.likes || 0,
            dislikes: item.dislikes || 0,
          }),
          status,
          watchProgress,
          watchedDuration: userProgress?.watchedDuration || 0,
        };
      })
      .sort((a, b) => a.sequence - b.sequence);

    // Final response for normal section
    res.status(200).json({
      success: true,
      data: {
        _id: targetSection._id,
        title: targetSection.title,
        introduction: targetSection.introduction || '',
        requiredTime: targetSection.requiredTime || 0,
        objective: targetSection.objective || '',
        content: processedContent,
        quiz: null, // Explicitly null — no quiz on normal sections
        chapterId: parentChapter._id,
        chapterTitle: parentChapter.title,
        canAccess: processedSection?.canAccess || true,
        status: processedSection?.status || 'Unlocked',
      },
      message: 'Section details retrieved successfully',
    });
  } catch (error) {
    console.error('Error in getSectionDetails:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// 🆕 HELPER FUNCTION FOR SECTION ACCESS CHECK
const checkSectionAccess = async (course, userEnrollment, chapterIndex, sectionIndex, customerId) => {
  try {
    console.log(`🔍 Checking access for Chapter ${chapterIndex}, Section ${sectionIndex}`);

    // Get all quiz results for this user in this course
    const userQuizResults = await getUserQuizResults(course._id, customerId);

    // Use the same logic as getCourseChaptersAndSections
    const processedChapters = await processChaptersWithUnlockStatus(
      course.chapters,
      userEnrollment,
      userQuizResults
    );

    // Find the target chapter and section
    const targetChapter = processedChapters[chapterIndex];
    if (!targetChapter) {
      console.log('❌ Target chapter not found');
      return false;
    }

    const targetSection = targetChapter.sections[sectionIndex];
    if (!targetSection) {
      console.log('❌ Target section not found');
      return false;
    }

    console.log(`✅ Section access result: ${targetSection.canAccess}`);
    return targetSection.canAccess;

  } catch (error) {
    console.error('Error checking section access:', error);
    return false;
  }
};




const toggleContentReaction = async (req, res) => {
  try {
    const { courseId, chapterId, sectionId, contentId } = req.params;
    const { reaction } = req.body; // 'like' or 'dislike'
    const userId = req.user.id;

    if (!reaction || !['like', 'dislike'].includes(reaction)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reaction. Must be "like" or "dislike"'
      });
    }

    // Find course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check enrollment
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === userId
    );

    if (!userEnrollment) {
      return res.status(403).json({
        success: false,
        message: 'Not enrolled in this course'
      });
    }

    // Find chapter
    const chapter = course.chapters.find(ch => ch._id.toString() === chapterId);
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }

    // Find section
    const section = chapter.sections.find(sec => sec._id.toString() === sectionId);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }

    // Find content
    const content = section.content.find(cont => cont._id.toString() === contentId);
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Initialize arrays if they don't exist
    if (!content.likedBy) content.likedBy = [];
    if (!content.dislikedBy) content.dislikedBy = [];

    // Check current user status
    const hasLiked = content.likedBy.some(like => like.toString() === userId);
    const hasDisliked = content.dislikedBy.some(dislike => dislike.toString() === userId);

    let message = '';
    let userLiked = false;
    let userDisliked = false;

    if (reaction === 'like') {
      if (hasLiked) {
        // Remove like
        content.likedBy = content.likedBy.filter(like => like.toString() !== userId);
        content.likes = Math.max(0, content.likes - 1);
        message = 'Like removed';
      } else {
        // Add like and remove dislike if exists
        if (hasDisliked) {
          content.dislikedBy = content.dislikedBy.filter(dislike => dislike.toString() !== userId);
          content.dislikes = Math.max(0, content.dislikes - 1);
        }
        content.likedBy.push(userId);
        content.likes = (content.likes || 0) + 1;
        userLiked = true;
        message = 'Content liked';
      }
    } else if (reaction === 'dislike') {
      if (hasDisliked) {
        // Remove dislike
        content.dislikedBy = content.dislikedBy.filter(dislike => dislike.toString() !== userId);
        content.dislikes = Math.max(0, content.dislikes - 1);
        message = 'Dislike removed';
      } else {
        // Add dislike and remove like if exists
        if (hasLiked) {
          content.likedBy = content.likedBy.filter(like => like.toString() !== userId);
          content.likes = Math.max(0, content.likes - 1);
        }
        content.dislikedBy.push(userId);
        content.dislikes = (content.dislikes || 0) + 1;
        userDisliked = true;
        message = 'Content disliked';
      }
    }

    await course.save();

    res.status(200).json({
      success: true,
      message: message,
      data: {
        contentId: contentId,
        likes: content.likes,
        dislikes: content.dislikes,
        userLiked: userLiked,
        userDisliked: userDisliked
      }
    });

  } catch (error) {
    console.error('Error toggling content reaction:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const getUserQuizResults = async (courseId, userId) => {
  try {
    // Find all quizzes for this course
    const quizzes = await Quiz.find({
      courseId: courseId,
      'attempts.userId': userId
    });

    const quizResultsMap = {};

    quizzes.forEach(quiz => {
      const userAttempts = quiz.attempts.filter(
        attempt => attempt.userId.toString() === userId.toString()
      );

      if (userAttempts.length > 0) {
        // Get best attempt
        const bestAttempt = userAttempts.reduce((best, current) =>
          current.percentage > best.percentage ? current : best
        );

        const quizResult = {
          quizId: quiz._id,
          attempts: userAttempts.length,
          bestScore: bestAttempt.score,
          bestPercentage: bestAttempt.percentage,
          passed: bestAttempt.passed,
          grade: bestAttempt.grade,
          lastAttemptDate: bestAttempt.attemptDate
        };

        // Handle both section-level and chapter-level quizzes
        // Section-level quizzes: use sectionId as key
        if (quiz.sectionId) {
          const sectionKey = quiz.sectionId.toString();
          quizResultsMap[sectionKey] = quizResult;
        }
        
        // Chapter-level quizzes: use chapterId as key
        if (quiz.chapterId) {
          const chapterKey = quiz.chapterId.toString();
          quizResultsMap[chapterKey] = quizResult;
        }
      }
    });

    return quizResultsMap;
  } catch (error) {
    console.error('Error in getUserQuizResults:', error);
    return {};
  }
};

// Helper function to process chapters with unlock status
// const processChaptersWithUnlockStatus = async (chapters, userEnrollment, userQuizResults) => {
//   const processedChapters = [];

//   // Sort chapters by sequence
//   const sortedChapters = chapters.sort((a, b) => a.sequence - b.sequence);

//   for (let i = 0; i < sortedChapters.length; i++) {
//     const chapter = sortedChapters[i];

//     console.log(`Chapter ${i} deadline:`, chapter.deadline);
//     console.log(`Chapter ${i} full object:`, JSON.stringify(chapter, null, 2));

//     // Determine chapter unlock status
//     let chapterStatus = 'Locked';
//     let canAccess = false;

//     // First chapter (sequence 1) is always unlocked
//     if (i === 0) {
//       chapterStatus = 'Unlocked';
//       canAccess = true;
//     } else {
//       // Check if previous chapter is completed
//       const previousChapter = sortedChapters[i - 1];
//       const isPreviousChapterCompleted = await isChapterCompleted(
//         previousChapter,
//         userQuizResults
//       );

//       if (isPreviousChapterCompleted) {
//         chapterStatus = 'Unlocked';
//         canAccess = true;
//       }
//     }

//     // Check if current chapter is completed
//     const isCurrentChapterCompleted = await isChapterCompleted(
//       chapter,
//       userQuizResults
//     );

//     if (isCurrentChapterCompleted) {
//       chapterStatus = 'Completed';
//     } else if (canAccess && hasChapterProgress(chapter, userEnrollment)) {
//       chapterStatus = 'In Progress';
//     }

//     // Process sections within chapter
//     const processedSections = await processSectionsWithUnlockStatus(
//       chapter.sections,
//       userQuizResults,
//       canAccess
//     );

//     // Calculate chapter progress
//     const chapterProgress = calculateChapterProgress(processedSections);

//     processedChapters.push({
//       _id: chapter._id,
//       title: chapter.title,
//       description: chapter.description,
//       sequence: chapter.sequence,
//       deadline: chapter.deadline || null,
//       status: chapterStatus,
//       canAccess: canAccess,
//       progress: chapterProgress,
//       sections: processedSections,
//       totalSections: chapter.sections.length,
//       completedSections: processedSections.filter(s => s.status === 'Completed').length
//     });
//   }

//   return processedChapters;
// };
const processChaptersWithUnlockStatus = async (chapters, userEnrollment, userQuizResults) => {
  const processedChapters = [];

  // Sort chapters by sequence (just in case)
  const sortedChapters = [...chapters].sort((a, b) => a.sequence - b.sequence);

  for (let i = 0; i < sortedChapters.length; i++) {
    const chapter = sortedChapters[i];

    // Determine chapter unlock status
    let chapterStatus = 'Locked';
    let canAccess = false;

    // First chapter is always unlocked
    if (i === 0) {
      chapterStatus = 'Unlocked';
      canAccess = true;
    } else {
      // Check if previous chapter is completed
      const previousChapter = sortedChapters[i - 1];
      const isPreviousChapterCompleted = await isChapterCompleted(
        previousChapter,
        userQuizResults,
        userEnrollment
      );

      if (isPreviousChapterCompleted) {
        chapterStatus = 'Unlocked';
        canAccess = true;
      }
    }

    // Check if current chapter is completed
    const isCurrentChapterCompleted = await isChapterCompleted(chapter, userQuizResults, userEnrollment);

    if (isCurrentChapterCompleted) {
      chapterStatus = 'Completed';
    } else if (canAccess && hasChapterProgress(chapter, userEnrollment)) {
      chapterStatus = 'In Progress';
    }

    // Process sections
    const processedSections = await processSectionsWithUnlockStatus(
      chapter.sections,
      userQuizResults,
      canAccess,
      userEnrollment
    );

    // Calculate progress percentage
    const totalSections = chapter.sections.length;
    const completedSections = processedSections.filter(s => s.status === 'Completed').length;
    const progress = totalSections > 0 
      ? Math.round((completedSections / totalSections) * 100)
      : 0;

    processedChapters.push({
      _id: chapter._id,
      title: chapter.title,
      description: chapter.description || '',
      sequence: chapter.sequence,
      deadline: chapter.deadline || null,
      status: chapterStatus,
      canAccess,
      progress,
      sections: processedSections,
      totalSections: chapter.sections.length,
      completedSections,

      // HIGHLIGHTED CHANGE: ADD QUIZ FIELD SO FRONTEND CAN DETECT IT
      quiz: chapter.quiz || null,  // ← THIS WAS MISSING BEFORE!

      // Optional: Add quiz progress info
      quizProgress: userQuizResults[chapter._id.toString()] || null
    });
  }

  return processedChapters;
};

// Helper function to process sections with unlock status
const processSectionsWithUnlockStatus = async (sections, userQuizResults, chapterCanAccess, userEnrollment = null) => {
  const processedSections = [];

  // Sort sections by sequence
  const sortedSections = sections.sort((a, b) => a.sequence - b.sequence);

  for (let i = 0; i < sortedSections.length; i++) {
    const section = sortedSections[i];

    let sectionStatus = 'Locked';
    let canAccess = false;
      
    if (!chapterCanAccess) {
      canAccess = false;
      sectionStatus = 'Locked';
    } else {
      if (i === 0) {
        // First section in unlocked chapter is always accessible
        canAccess = true;
      } else {
        // Check if previous section is completed
        const prevSection = sortedSections[i - 1];
        const isPrevSectionCompleted = isSectionCompleted(prevSection, userQuizResults, userEnrollment);
        
        if (isPrevSectionCompleted) {
          canAccess = true;
        } else {
          canAccess = false;
        }
        if (prevSection?.quiz) {
        const quizResult = userQuizResults?.[prevSection._id.toString()];
        if (!quizResult || quizResult.attempts === 0) {
          canAccess = false;
          sectionStatus = 'Locked';
        }
      }
      }

      // Determine section status
      if (isSectionCompleted(section, userQuizResults, userEnrollment)) {
        sectionStatus = 'Completed';
      } else if (canAccess) {
        // Check if section has any progress
        const chapterProgress = userEnrollment?.chapterProgress?.find(
          cp => {
            // Find the chapter that contains this section
            // We need to check all chapters to find the right one
            return cp.sectionProgress?.some(
              sp => sp.sectionId && sp.sectionId.toString() === section._id.toString()
            );
          }
        );
        
        const sectionProgress = chapterProgress?.sectionProgress?.find(
          sp => sp.sectionId && sp.sectionId.toString() === section._id.toString()
        );
        
        // Check if section has any content progress
        const hasProgress = sectionProgress?.contentProgress && sectionProgress.contentProgress.length > 0;
        
        if (hasProgress) {
          sectionStatus = 'In Progress';
        } else {
          sectionStatus = 'Unlocked';
        }
      } else {
        sectionStatus = 'Locked';
      }
    }

    // Get quiz information if exists
    let quizInfo = null;
    if (section.quiz) {
      const quizResult = userQuizResults[section._id.toString()];
      quizInfo = {
        quizId: section.quiz._id,
        title: section.quiz.title,
        timeLimit: section.quiz.timeLimit,
        maxAttempts: section.quiz.maxAttempts,
        passingScore: section.quiz.passingScore,
        userResult: quizResult || {
          attempts: 0,
          bestScore: 0,
          bestPercentage: 0,
          passed: false,
          grade: 'Not Attempted'
        }
      };
    }

    processedSections.push({
      _id: section._id,
      title: section.title,
      sequence: section.sequence,
      introduction: section.introduction,
      objective: section.objective,
      status: sectionStatus,
      canAccess: canAccess,
      totalContent: section.content ? section.content.length : 0,
      quiz: quizInfo,
      content: canAccess ? section.content : [] // Only show content if accessible
    });
  }

  return processedSections;
};

const isChapterCompleted = async (chapter, userQuizResults, userEnrollment = null) => {
  // 1️⃣ All sections must be completed
  for (const section of chapter.sections) {
    if (!isSectionCompleted(section, userQuizResults, userEnrollment)) {
      return false;
    }
  }

  // 2️⃣ If chapter has quiz → ATTEMPT REQUIRED
  if (chapter.quiz) {
    const quizResult = userQuizResults?.[chapter._id.toString()];

    if (!quizResult || quizResult.attempts === 0) {
      return false; 
    }
  }

  return true;
};


// Helper function to check if chapter is completed
// const isChapterCompleted = async (chapter, userQuizResults) => {
//   // Chapter is completed if all sections with quizzes are passed with 70%+
//   for (const section of chapter.sections) {
//     if (section.quiz) {
//       const quizResult = userQuizResults[section._id.toString()];
//       if (!quizResult || !quizResult.passed || quizResult.bestPercentage < 70) {
//         return false;
//       }
//     }
//   }
//   return true;
// };

// const isChapterCompleted = async (chapter, userQuizResults, userEnrollment = null) => {
//   for (const section of chapter.sections) {
//     if (!isSectionCompleted(section, userQuizResults, userEnrollment)) {
//       return false;
//     }
//   }
//   return true;
// };




// Helper function to check if section is completed
const isSectionCompleted = (section, userQuizResults, userEnrollment = null) => {

  // Content completion drives progression (quizzes are grading, not locking)
  if (!section.content || section.content.length === 0) {
    return true;
  }

  if (!userEnrollment || !userEnrollment.chapterProgress) {
    return false;
  }

  // Find section progress by checking all chapters
  let sectionProgress = null;
  for (const chapterProgress of userEnrollment.chapterProgress) {
    sectionProgress = chapterProgress.sectionProgress?.find(
      (sp) => sp.sectionId && sp.sectionId.toString() === section._id.toString()
    );
    if (sectionProgress) break;
  }

  if (!sectionProgress) return false;

  for (const content of section.content) {
    const contentProgress = sectionProgress.contentProgress?.find(
      (cp) => cp.contentId && cp.contentId.toString() === content._id.toString()
    );

    if (!contentProgress) return false;

    if (content.contentType === 'video') {
      const minWatchTime = content.minimumWatchTime || 0;
      if ((contentProgress.watchedDuration || 0) < minWatchTime) return false;
    } else if (content.contentType === 'text') {
      if (!contentProgress.completed) return false;
    }
  }

  return true;
};


// const isSectionCompleted = (section, userQuizResults) => {
//   if (section.quiz) {
//     const quizResult = userQuizResults[section._id.toString()];
//     return quizResult && quizResult.passed && quizResult.bestPercentage >= 70;
//   }
//   return false; // If no quiz, consider based on content completion
// };

// Helper function to check if chapter has progress
const hasChapterProgress = (chapter, userEnrollment) => {
  const chapterProgress = userEnrollment.chapterProgress.find(
    cp => cp.chapterId.toString() === chapter._id.toString()
  );
  return chapterProgress && chapterProgress.sectionProgress.length > 0;
};

// Helper function to check if section has progress
const hasSectionProgress = (section, userQuizResults) => {
  const quizResult = userQuizResults[section._id.toString()];
  return quizResult && quizResult.attempts > 0;
};

// Helper function to calculate chapter progress
const calculateChapterProgress = (sections) => {
  if (sections.length === 0) return 0;

  const completedSections = sections.filter(s => s.status === 'Completed').length;
  return Math.round((completedSections / sections.length) * 100);
};



const getUserCourseHistory = async (req, res) => {

  try {
    console.log("enter the controller")
    const userId = req.user._id;
    const { courseId } = req.params;

    const course = await Course.findById(courseId)
      .select('name videos enrolledUsers')
      .populate({
        path: "videos.quizId",
        model: 'Quiz',
        select: 'attempts passingScore questions',
      });
    // console.log('Populated course:', JSON.stringify(course, null, 2));

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const userEnrollment = course.enrolledUsers.find(e => e.user.toString() === userId.toString());
    if (!userEnrollment) {
      return res.status(404).json({ message: 'User not enrolled in this course' });
    }

    const courseHistory = {
      courseName: course.name,
      courseDuration: course.courseDuration,
      videos: course.videos.map(video => {
        const videoProgress = userEnrollment.completedVideos.find(
          v => v.videoId.toString() === video._id.toString()
        );
        // console.log('Video Quiz:', video.quizId);  // Check if quiz is populated
        // console.log('Video Progress:', videoProgress); 
        return {
          videoId: video._id,
          title: video.title,
          completed: videoProgress ? videoProgress.completed : false,
          watchedDuration: videoProgress ? videoProgress.watchedDuration : 0,
          lastWatchedAt: videoProgress ? videoProgress.lastWatchedAt : null,
          quiz: video.quizId ? {
            quizId: video.quizId._id,
            status: videoProgress ? videoProgress.quizStatus : 'Not Attempted',
            grade: videoProgress ? videoProgress.grade : null,
            attempts: Array.isArray(video.quizId.attempts) ? video.quizId.attempts
              .filter(a => a.userId && a.userId.toString() === userId.toString())
              .map(attempt => ({
                score: attempt.score || 0,
                grade: attempt.grade || 'N/A',
                passed: attempt.passed || false,
                attemptDate: attempt.attemptDate
              })) : []
          } : null
        };
      })
    };

    res.status(200).json(courseHistory);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};





const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true })
      // .populate('instructor', 'username email')
      // .select('name description thumbnail approximateHours totalVideos videos isActive')
      .sort({ createdAt: -1 });

    res.status(200).json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// main page completion course check krna ha 
const getUserCompletedCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role; // Assuming role is available in user object

    // Find all courses where user is enrolled
    const courses = await Course.find({
      'enrolledUsers.user': userId,
      // Filter by user role if needed
      'accessControl.roles': userRole
    });

    if (!courses || courses.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No courses found for this user',
        data: {
          totalCourses: 0,
          completedCourses: 0,
          courses: []
        }
      });
    }

    // Filter and process completed courses
    const completedCourses = courses.map(course => {
      const enrollment = course.enrolledUsers.find(
        enrollment => enrollment.user.toString() === userId
      );

      // Check if course is completed
      const isCompleted = enrollment.status === 'Completed';

      if (!isCompleted) return null;

      return {
        courseId: course._id,
        courseName: course.name,
        courseDuration: course.courseDuration,
        courseType: course.courseType,
        thumbnail: course.thumbnail,
        status: enrollment.status,
        completionDate: enrollment.chapterProgress.length > 0 ?
          Math.max(...enrollment.chapterProgress.map(cp =>
            cp.sectionProgress.length > 0 ?
              Math.max(...cp.sectionProgress.map(sp =>
                new Date(sp.quizProgress?.lastAttemptDate || 0).getTime()
              )) : 0
          )) : null,
        grade: {
          overallGrade: enrollment.overallGrade || 0,
          percentage: enrollment.gradePercentage || 0,
          label: enrollment.gradeLabel || 'Not Graded'
        },
        certificateEarned: enrollment.certificateEarned || false,
        certificateUrl: enrollment.certificateUrl || null
      };
    }).filter(course => course !== null);

    // Calculate statistics
    const gradeDistribution = {
      A: completedCourses.filter(c => c.grade.label === 'A').length,
      B: completedCourses.filter(c => c.grade.label === 'B').length,
      C: completedCourses.filter(c => c.grade.label === 'C').length,
      D: completedCourses.filter(c => c.grade.label === 'D').length,
      F: completedCourses.filter(c => c.grade.label === 'F').length
    };

    const averageGrade = completedCourses.length > 0 ?
      completedCourses.reduce((sum, course) => sum + course.grade.percentage, 0) / completedCourses.length : 0;

    // Get all courses with their status
    const allCourses = courses.map(course => {
      const enrollment = course.enrolledUsers.find(
        enrollment => enrollment.user.toString() === userId
      );

      return {
        courseId: course._id,
        courseName: course.name,
        courseDuration: course.courseDuration,
        courseType: course.courseType,
        thumbnail: course.thumbnail,
        status: enrollment.status,
        progress: enrollment.progress,
        grade: {
          overallGrade: enrollment.overallGrade || 0,
          percentage: enrollment.gradePercentage || 0,
          label: enrollment.gradeLabel || 'Not Graded'
        },
        certificateEarned: enrollment.certificateEarned || false,
        certificateUrl: enrollment.certificateUrl || null
      };
    });

    res.status(200).json({
      success: true,
      data: {
        totalCourses: courses.length,
        completedCourses: completedCourses.length,
        inProgressCourses: allCourses.filter(c => c.status === 'In Progress').length,
        lockedCourses: allCourses.filter(c => c.status === 'Locked').length,
        unlockedCourses: allCourses.filter(c => c.status === 'Unlocked').length,
        notStartedCourses: allCourses.filter(c => c.status === 'Not Started').length,
        statistics: {
          averageGrade: Math.round(averageGrade),
          gradeDistribution: gradeDistribution,
          certificatesEarned: completedCourses.filter(c => c.certificateEarned).length
        },
        completedCourses: completedCourses,
        allCourses: allCourses
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user completed courses',
      error: error.message
    });
  }
};






const updateVideoLikeDislike = async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    const { action } = req.body; // 'like' or 'dislike'

    if (!['like', 'dislike'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Use "like" or "dislike".' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const video = course.videos.id(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    if (action === 'like') {
      video.likes += 1;
    } else {
      video.dislikes += 1;
    }

    await course.save();

    res.status(200).json({
      message: `Video ${action}d successfully`,
      likes: video.likes,
      dislikes: video.dislikes
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// new comment
// const getUserCourseProgress = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     console.log("Getting course progress for user:", userId);

//     // Find all courses where the user is enrolled
//     const courses = await Course.find({
//       'enrolledUsers.user': userId
//     }).select('name description thumbnail level courseType language approximateHours totalVideos status passingGrade chapters enrolledUsers weightage');

//     console.log(`Found ${courses.length} courses for user`);

//     if (!courses || courses.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: 'User is not enrolled in any courses',
//         data: {
//           mainCourses: [],
//           shortCourses: []
//         }
//       });
//     }

//     // Process courses to get progress details
//     const processedCourses = [];

//     for (const course of courses) {
//       console.log(`Processing course: ${course.name}`);

//       // Check if enrolledUsers exists
//       if (!course.enrolledUsers || !Array.isArray(course.enrolledUsers)) {
//         console.log(`Course ${course._id} has no enrolledUsers array`);
//         continue;
//       }

//       // Find user's enrollment in this course
//       const enrollment = course.enrolledUsers.find(
//         e => e && e.user && e.user.toString() === userId
//       );

//       if (!enrollment) {
//         console.log(`User enrollment not found in course ${course._id}`);
//         continue;
//       }

//       console.log(`Found enrollment for user in course ${course._id}`);

//       // Calculate total quizzes and completed quizzes
//       let totalQuizzes = 0;
//       let completedQuizzes = 0;

//       // Check if chapters exists
//       if (!course.chapters || !Array.isArray(course.chapters)) {
//         console.log(`Course ${course._id} has no chapters array`);




//         // Create a basic course object without quiz stats
//         processedCourses.push({
//           _id: course._id,
//           name: course.name,
//           description: course.description,
//           thumbnail: course.thumbnail,
//           level: course.level,
//           courseType: course.courseType || 'Course',
//           language: course.language,
//           approximateHours: course.approximateHours,
//           totalVideos: course.totalVideos,
//           progress: enrollment.progress || 0,
//           gradePercentage: enrollment.gradePercentage || 0,
//           gradeLabel: enrollment.gradeLabel || 'Incomplete',
//           status: enrollment.progress === 100 ? 
//             (enrollment.gradePercentage >= course.passingGrade ? 'Completed' : 'Failed') : 
//             (enrollment.progress === 0 ? 'Not Started' : 'In Progress'),
//           quizStats: {
//             total: 0,
//             completed: 0,
//             percentage: 0
//           },
//           lastAccessed: enrollment.lastAccessedAt || enrollment.enrollmentDate
//         });

//         continue;
//       }

//       // Process chapters and sections if they exist
//       for (const chapter of course.chapters) {
//         if (!chapter.sections || !Array.isArray(chapter.sections)) {
//           console.log(`Chapter ${chapter._id} has no sections array`);
//           continue;
//         }

//         for (const section of chapter.sections) {
//           if (section.quiz) {
//             totalQuizzes++;

//             // Check if chapterProgress exists
//             if (!enrollment.chapterProgress || !Array.isArray(enrollment.chapterProgress)) {
//               console.log(`Enrollment has no chapterProgress array`);
//               continue;
//             }

//             const chapterProgress = enrollment.chapterProgress.find(
//               cp => cp && cp.chapterId && chapter._id && 
//               cp.chapterId.toString() === chapter._id.toString()
//             );

//             if (!chapterProgress) {
//               console.log(`Chapter progress not found for chapter ${chapter._id}`);
//               continue;
//             }

//             if (!chapterProgress.sectionProgress || !Array.isArray(chapterProgress.sectionProgress)) {
//               console.log(`Chapter progress has no sectionProgress array`);
//               continue;
//             }

//             const sectionProgress = chapterProgress.sectionProgress.find(
//               sp => sp && sp.sectionId && section._id && 
//               sp.sectionId.toString() === section._id.toString()
//             );

//             if (!sectionProgress) {
//               console.log(`Section progress not found for section ${section._id}`);
//               continue;
//             }

//             if (sectionProgress.quizProgress && sectionProgress.quizProgress.passed) {
//               completedQuizzes++;
//             }
//           }
//         }
//       }

//       // Determine course status
//       let status = 'In Progress';
//       if (enrollment.progress === 0) {
//         status = 'Not Started';
//       } else if (enrollment.progress === 100) {
//         if (enrollment.gradePercentage >= course.passingGrade) {
//           status = 'Completed';
//         } else {
//           status = 'Failed';
//         }
//       }

//       let totalWeightage = 0;
// let quizCount = 0;

// if (course.chapters && Array.isArray(course.chapters)) {
//   course.chapters.forEach(chapter => {
//     if (chapter.sections && Array.isArray(chapter.sections)) {
//       chapter.sections.forEach(section => {
//         if (section.quiz && section.quiz.weightage) {
//           totalWeightage += section.quiz.weightage;
//           quizCount++;
//         }
//       });
//     }
//   });
// }

// const avgWeightage = quizCount > 0 ? Math.round(totalWeightage / quizCount) : (course.weightage || 100);

//       // Create course summary object
//       processedCourses.push({
//         _id: course._id,
//         name: course.name,
//         description: course.description,
//         thumbnail: course.thumbnail,
//         level: course.level,
//         courseType: course.courseType || 'Course',
//         language: course.language,
//         approximateHours: course.approximateHours,
//         totalVideos: course.totalVideos,
//         progress: enrollment.progress || 0,
//         gradePercentage: enrollment.gradePercentage || 0,
//         gradeLabel: enrollment.gradeLabel || 'Incomplete',
//         status: status,
//          weightage: avgWeightage, 
//         quizStats: {
//           total: totalQuizzes,
//           completed: completedQuizzes,
//           percentage: totalQuizzes > 0 ? Math.round((completedQuizzes / totalQuizzes) * 100) : 0
//         },
//         lastAccessed: enrollment.lastAccessedAt || enrollment.enrollmentDate
//       });
//     }

//     console.log(`Processed ${processedCourses.length} courses successfully`);

//     // Separate main courses and short courses
//     const mainCourses = processedCourses.filter(course => course.courseType === 'Course');
//     const shortCourses = processedCourses.filter(course => 
//       course.courseType === 'Short Course' || course.courseType === 'Task'
//     );

//     res.status(200).json({
//       success: true,
//       data: {
//         mainCourses,
//         shortCourses
//       }
//     });
//   } catch (error) {
//     console.error('Error getting user course progress:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error getting user course progress',
//       error: error.message
//     });
//   }
// };


// after login second step: 
// const getAssignedCourses = async (req, res) => {
//     try {
//         // Get the logged-in user's role and warehouse from the request
//         const userRoleId = req.user.role;
//         const userWarehouseId = req.user.warehouse;

//         // Find all courses that are assigned to the user's role or warehouse
//         const courses = await Course.find({
//             isActive: true,
//             $or: [
//                 { 'accessControl.roles': userRoleId },
//                 { 'accessControl.stores': userWarehouseId }
//             ]
//         }).select('name description thumbnail level courseType language approximateHours totalVideos status');

//         res.status(200).json({
//             success: true,
//             count: courses.length,
//             data: courses
//         });
//     } catch (error) {
//         console.error('Error getting assigned courses:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error getting assigned courses',
//             error: error.message
//         });
//     }
// };



// const getUserCourseProgress = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     console.log("Getting course progress for user:", userId);

//     // Find all courses where the user is enrolled
//     const courses = await Course.find({
//       'enrolledUsers.user': userId
//     }).select('name description thumbnail level courseType language approximateHours totalVideos status passingGrade chapters enrolledUsers weightage');

//     console.log(`Found ${courses.length} courses for user`);

//     if (!courses || courses.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: 'User is not enrolled in any courses',
//         data: {
//           mainCourses: [],
//           shortCourses: []
//         }
//       });
//     }

//     // Process courses to get progress details
//     const processedCourses = [];

//     for (const course of courses) {
//       console.log(`Processing course: ${course.name}`);

//       // Check if enrolledUsers exists
//       if (!course.enrolledUsers || !Array.isArray(course.enrolledUsers)) {
//         console.log(`Course ${course._id} has no enrolledUsers array`);
//         continue;
//       }

//       // Find user's enrollment in this course
//       const enrollment = course.enrolledUsers.find(
//         e => e && e.user && e.user.toString() === userId
//       );

//       if (!enrollment) {
//         console.log(`User enrollment not found in course ${course._id}`);
//         continue;
//       }

//       console.log(`Found enrollment for user in course ${course._id}`);

//       // Get actual quiz results from Quiz collection
//       const quizResults = await Quiz.find({
//         courseId: course._id,
//         'attempts.userId': userId
//       });

//       // Initialize counters
//       let totalSections = 0;
//       let completedSections = 0;
//       let totalContent = 0;
//       let completedContent = 0;
//       let totalQuizzes = 0;
//       let passedQuizzes = 0;
//       let failedQuizzes = 0;
//       let totalQuizScore = 0;
//       let totalPossibleQuizScore = 0;
//       let hasAnyQuizAttempt = false;
//       let hasAnyFailedQuiz = false; // Key flag for failed status

//       // Check if chapters exists
//       if (!course.chapters || !Array.isArray(course.chapters)) {
//         console.log(`Course ${course._id} has no chapters array`);

//         // Create a basic course object without detailed stats
//         processedCourses.push({
//           _id: course._id,
//           name: course.name,
//           description: course.description,
//           thumbnail: course.thumbnail,
//           level: course.level,
//           courseType: course.courseType || 'Course',
//           language: course.language,
//           approximateHours: course.approximateHours,
//           totalVideos: course.totalVideos,
//           progress: enrollment.progress || 0,
//           gradePercentage: enrollment.gradePercentage || 0,
//           gradeLabel: enrollment.gradeLabel || 'Incomplete',
//           status: enrollment.progress === 100 ? 
//             (enrollment.gradePercentage >= course.passingGrade ? 'Completed' : 'Failed') : 
//             (enrollment.progress === 0 ? 'Not Started' : 'In Progress'),
//           quizStats: {
//             total: 0,
//             completed: 0,
//             percentage: 0
//           },
//           lastAccessed: enrollment.lastAccessedAt || enrollment.enrollmentDate
//         });

//         continue;
//       }

//       // Process each chapter and section
//       for (const chapter of course.chapters) {
//         if (!chapter.sections || !Array.isArray(chapter.sections)) {
//           console.log(`Chapter ${chapter._id} has no sections array`);
//           continue;
//         }

//         // Find chapter progress
//         const chapterProgress = enrollment.chapterProgress?.find(
//           cp => cp && cp.chapterId && cp.chapterId.toString() === chapter._id.toString()
//         );

//         for (const section of chapter.sections) {
//           totalSections++;

//           // Find section progress
//           const sectionProgress = chapterProgress?.sectionProgress?.find(
//             sp => sp && sp.sectionId && sp.sectionId.toString() === section._id.toString()
//           );

//           // Count content items and their completion
//           if (section.content && Array.isArray(section.content)) {
//             for (const content of section.content) {
//               totalContent++;

//               // Check if content is completed
//               const contentProgress = sectionProgress?.contentProgress?.find(
//                 cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
//               );

//               if (contentProgress) {
//                 if (content.contentType === 'video') {
//                   // Video is completed if watched duration >= minimum watch time
//                   if (contentProgress.watchedDuration >= content.minimumWatchTime) {
//                     completedContent++;
//                   }
//                 } else if (content.contentType === 'text') {
//                   // Text is completed if marked as completed
//                   if (contentProgress.completed) {
//                     completedContent++;
//                   }
//                 }
//               }
//             }
//           }

//           // Check quiz for this section
//           if (section.quiz) {
//             totalQuizzes++;

//             // Find actual quiz result from Quiz collection
//             const quizResult = quizResults.find(quiz => 
//               quiz.sectionId.toString() === section._id.toString()
//             );

//             if (quizResult) {
//               // Get user's attempts for this quiz
//               const userAttempts = quizResult.attempts.filter(
//                 attempt => attempt.userId.toString() === userId
//               );

//               if (userAttempts.length > 0) {
//                 hasAnyQuizAttempt = true;

//                 // Get best attempt
//                 const bestAttempt = userAttempts.reduce((best, current) => 
//                   current.percentage > best.percentage ? current : best
//                 );

//                 // Add to total possible score
//                 totalPossibleQuizScore += 100;
//                 totalQuizScore += bestAttempt.percentage;

//                 // Check if quiz is passed (70% or above)
//                 if (bestAttempt.passed && bestAttempt.percentage >= 70) {
//                   passedQuizzes++;
//                 } else {
//                   failedQuizzes++;
//                   hasAnyFailedQuiz = true; // Mark that user has failed at least one quiz
//                   console.log(`Quiz failed in section ${section._id}: ${bestAttempt.percentage}%`);
//                 }
//               } else {
//                 totalPossibleQuizScore += 100;
//                 // No attempts = not failed yet, just not attempted
//               }
//             } else {
//               totalPossibleQuizScore += 100;
//               // No quiz found = not failed yet, just not attempted
//             }
//           }

//           // Determine if section is completed
//           // Section is completed if:
//           // 1. All content is completed AND
//           // 2. Quiz is passed (if quiz exists)
//           let sectionCompleted = true;

//           // Check content completion
//           if (section.content && section.content.length > 0) {
//             const sectionContentCount = section.content.length;
//             const sectionCompletedContent = section.content.filter(content => {
//               const contentProgress = sectionProgress?.contentProgress?.find(
//                 cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
//               );

//               if (!contentProgress) return false;

//               if (content.contentType === 'video') {
//                 return contentProgress.watchedDuration >= content.minimumWatchTime;
//               } else if (content.contentType === 'text') {
//                 return contentProgress.completed;
//               }
//               return false;
//             }).length;

//             if (sectionCompletedContent < sectionContentCount) {
//               sectionCompleted = false;
//             }
//           }

//           // Check quiz completion (if quiz exists)
//           if (section.quiz && sectionCompleted) {
//             const quizResult = quizResults.find(quiz => 
//               quiz.sectionId.toString() === section._id.toString()
//             );

//             if (quizResult) {
//               const userAttempts = quizResult.attempts.filter(
//                 attempt => attempt.userId.toString() === userId
//               );

//               if (userAttempts.length > 0) {
//                 const bestAttempt = userAttempts.reduce((best, current) => 
//                   current.percentage > best.percentage ? current : best
//                 );

//                 // Quiz must be passed for section to be completed
//                 if (!bestAttempt.passed || bestAttempt.percentage < 70) {
//                   sectionCompleted = false;
//                 }
//               } else {
//                 sectionCompleted = false; // No quiz attempts
//               }
//             } else {
//               sectionCompleted = false; // No quiz found
//             }
//           }

//           if (sectionCompleted) {
//             completedSections++;
//           }
//         }
//       }

//       // Calculate overall progress percentage
//       let overallProgress = 0;
//       if (totalSections > 0) {
//         overallProgress = Math.round((completedSections / totalSections) * 100);
//       }

//       // Calculate grade percentage based on quiz results
//       let gradePercentage = 0;
//       if (totalPossibleQuizScore > 0) {
//         gradePercentage = Math.round((totalQuizScore / totalPossibleQuizScore) * 100);
//       }

//       // Determine grade label
//       let gradeLabel = 'Incomplete';
//       if (gradePercentage >= 90) {
//         gradeLabel = 'A';
//       } else if (gradePercentage >= 80) {
//         gradeLabel = 'B';
//       } else if (gradePercentage >= 70) {
//         gradeLabel = 'C';
//       } else if (gradePercentage >= 60) {
//         gradeLabel = 'D';
//       } else if (gradePercentage > 0) {
//         gradeLabel = 'F';
//       }

//       // **MAIN LOGIC FOR STATUS DETERMINATION**
//       let status = 'Not Started';

//       console.log(`Course ${course.name} status calculation:`, {
//         overallProgress,
//         hasAnyQuizAttempt,
//         hasAnyFailedQuiz,
//         failedQuizzes,
//         passedQuizzes,
//         totalQuizzes,
//         gradePercentage,
//         passingGrade: course.passingGrade
//       });

//       if (overallProgress === 0 && !hasAnyQuizAttempt) {
//         status = 'Not Started';
//       } 
//       // **KEY LOGIC: If user has failed any quiz, course is failed**
//       else if (hasAnyFailedQuiz) {
//         status = 'Failed';
//         gradeLabel = 'F'; // Force F grade if any quiz failed
//         console.log(`Course ${course.name} marked as Failed due to failed quiz(s)`);
//       }
//       // If all sections completed and all quizzes passed
//       else if (overallProgress === 100 && failedQuizzes === 0) {
//         if (gradePercentage >= course.passingGrade) {
//           status = 'Completed';
//         } else {
//           status = 'Failed';
//         }
//       }
//       // Course is in progress
//       else {
//         status = 'In Progress';
//       }

//       // Calculate weightage
//       let totalWeightage = 0;
//       let quizCount = 0;

//       if (course.chapters && Array.isArray(course.chapters)) {
//         course.chapters.forEach(chapter => {
//           if (chapter.sections && Array.isArray(chapter.sections)) {
//             chapter.sections.forEach(section => {
//               if (section.quiz) {
//                 const quiz = quizResults.find(q => 
//                   q.sectionId.toString() === section._id.toString()
//                 );
//                 if (quiz && quiz.weightage) {
//                   totalWeightage += quiz.weightage;
//                   quizCount++;
//                 }
//               }
//             });
//           }
//         });
//       }

//       const avgWeightage = quizCount > 0 ? Math.round(totalWeightage / quizCount) : (course.weightage || 100);

//       // Create course summary object
//       processedCourses.push({
//         _id: course._id,
//         name: course.name,
//         description: course.description,
//         thumbnail: course.thumbnail,
//         level: course.level,
//         courseType: course.courseType || 'Course',
//         language: course.language,
//         approximateHours: course.approximateHours,
//         totalVideos: course.totalVideos,
//         progress: overallProgress,
//         gradePercentage: gradePercentage,
//         gradeLabel: gradeLabel,
//         status: status,
//         weightage: avgWeightage,
//         quizStats: {
//           total: totalQuizzes,
//           completed: passedQuizzes,
//           failed: failedQuizzes,
//           percentage: totalQuizzes > 0 ? Math.round((passedQuizzes / totalQuizzes) * 100) : 0
//         },
//         contentStats: {
//           total: totalContent,
//           completed: completedContent,
//           percentage: totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0
//         },
//         sectionStats: {
//           total: totalSections,
//           completed: completedSections,
//           percentage: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0
//         },
//         lastAccessed: enrollment.lastAccessedAt || enrollment.enrollmentDate
//       });
//     }

//     console.log(`Processed ${processedCourses.length} courses successfully`);

//     // Separate main courses and short courses
//     const mainCourses = processedCourses.filter(course => course.courseType === 'Course');
//     const shortCourses = processedCourses.filter(course => 
//       course.courseType === 'Short Course' || course.courseType === 'Task'
//     );

//     res.status(200).json({
//       success: true,
//       data: {
//         mainCourses,
//         shortCourses
//       }
//     });
//   } catch (error) {
//     console.error('Error getting user course progress:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error getting user course progress',
//       error: error.message
//     });
//   }
// };


const getUserCourseProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Getting course progress for user:", userId);

    /* ======================================================
       1️⃣ GET CUSTOMER (ROLE + WAREHOUSE)
    ====================================================== */
    const customer = await Customer.findById(userId)
      .populate('role')
      .populate('warehouse');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Handle warehouse - it can be an array or single value
    const warehouseID = Array.isArray(customer.warehouse) && customer.warehouse.length > 0
      ? customer.warehouse[0]._id
      : customer.warehouse?._id || customer.warehouse;

    /* ======================================================
       2️⃣ ASSIGNED / ACCESSIBLE MAIN COURSES (SYLLABUS)
    ====================================================== */
    const assignedMainCourses = await Course.find({
      isActive: true,
      courseType: 'Course',
      $and: [
        {
          $or: [
            { 'accessControl.roles': customer.role._id },
            { 'accessControl.roles': { $size: 0 } }
          ]
        },
        {
          $or: [
            { 'accessControl.stores': warehouseID },
            { 'accessControl.stores': { $size: 0 } }
          ]
        }
      ]
    }).select('_id name sequence enrolledUsers');

    console.log(`Found ${assignedMainCourses.length} assigned main courses for user`);

    /* ======================================================
       3️⃣ USER ENROLLED COURSES (FOR PROGRESS DETAILS)
    ====================================================== */
    // Find all courses where the user is enrolled
    const courses = await Course.find({
      'enrolledUsers.user': userId
    }).select('name description thumbnail courseDuration level courseType language approximateHours totalVideos status passingGrade chapters enrolledUsers weightage sequence')
      .populate({
        path: 'enrolledUsers.certificateRequestId',
        model: 'CertificateRequest',
        select: 'status certificateId createdAt reviewedAt certificateImagePath'
      });

    console.log(`Found ${courses.length} courses for user`);

    if (!courses || courses.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'User is not enrolled in any courses',
        data: {
          mainCourses: [],
          shortCourses: []
        }
      });
    }

    // Get all quiz results for this user
    const allQuizResults = await Quiz.find({
      'attempts.userId': userId
    });

    // Process courses to get progress details
    const processedCourses = [];

    // ✅ FIRST PASS: Process all courses to get their status
    for (const course of courses) {
      console.log(`Processing course: ${course.name}`);

      // Find user's enrollment in this course
      const enrollment = course.enrolledUsers.find(
        e => e && e.user && e.user.toString() === userId
      );

      if (!enrollment) {
        console.log(`User enrollment not found in course ${course._id}`);
        continue;
      }

      console.log(`Found enrollment for user in course ${course._id}`);

      // Get quiz results for this course
      const courseQuizResults = allQuizResults.filter(quiz =>
        quiz.courseId.toString() === course._id.toString()
      );

      // Initialize counters
      let totalSections = 0;
      let completedSections = 0;
      let totalContent = 0;
      let completedContent = 0;
      let totalQuizzes = 0;
      let passedQuizzes = 0;
      let failedQuizzes = 0;
      let totalQuizScore = 0;
      let totalPossibleQuizScore = 0;
      let hasAnyQuizAttempt = false;
      let hasAnyFailedQuiz = false;

      // 🆕 QUIZ ATTEMPT DETAILS
      let quizAttempts = [];

      // Check if chapters exists
      if (!course.chapters || !Array.isArray(course.chapters)) {
        console.log(`Course ${course._id} has no chapters array`);
        continue;
      }

      // Process each chapter and section
      for (const chapter of course.chapters) {
        if (!chapter.sections || !Array.isArray(chapter.sections)) {
          console.log(`Chapter ${chapter._id} has no sections array`);
          continue;
        }

        // Find chapter progress
        const chapterProgress = enrollment.chapterProgress?.find(
          cp => cp && cp.chapterId && cp.chapterId.toString() === chapter._id.toString()
        );

        for (const section of chapter.sections) {
          totalSections++;

          // Auto-complete empty sections (no content, no quiz)
          if ((!section.content || section.content.length === 0) && !section.quiz) {
            completedSections++;
            continue;
          }

          // Find section progress
          const sectionProgress = chapterProgress?.sectionProgress?.find(
            sp => sp && sp.sectionId && sp.sectionId.toString() === section._id.toString()
          );

          // Count content items and their completion
          if (section.content && Array.isArray(section.content)) {
            for (const content of section.content) {
              totalContent++;

              // Check if content is completed
              const contentProgress = sectionProgress?.contentProgress?.find(
                cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
              );

              if (contentProgress) {
                if (content.contentType === 'video') {
                  if (contentProgress.watchedDuration >= content.minimumWatchTime) {
                    completedContent++;
                  }
                } else if (content.contentType === 'text') {
                  if (contentProgress.completed) {
                    completedContent++;
                  }
                }
              }
            }
          }

          // Check quiz for this section
          if (section.quiz) {
            totalQuizzes++;

            // Find actual quiz result from Quiz collection
            const quizResult = courseQuizResults.find(quiz =>
              quiz.sectionId.toString() === section._id.toString()
            );

            if (quizResult) {
              // Get user's attempts for this quiz
              const userAttempts = quizResult.attempts.filter(
                attempt => attempt.userId.toString() === userId
              );

              if (userAttempts.length > 0) {
                hasAnyQuizAttempt = true;

                // Get best attempt
                const bestAttempt = userAttempts.reduce((best, current) =>
                  current.percentage > best.percentage ? current : best
                );

                // 🆕 ADD QUIZ ATTEMPT DETAILS
                quizAttempts.push({
                  quizId: quizResult._id,
                  quizTitle: quizResult.title,
                  sectionTitle: section.title,
                  chapterTitle: chapter.title,
                  totalAttempts: userAttempts.length,
                  maxAttempts: quizResult.maxAttempts,
                  bestScore: bestAttempt.percentage,
                  bestGrade: bestAttempt.grade,
                  passed: bestAttempt.passed,
                  lastAttemptDate: bestAttempt.attemptDate,
                  timeLimit: quizResult.timeLimit,
                  passingScore: quizResult.passingScore
                });

                totalPossibleQuizScore += 100;
                totalQuizScore += bestAttempt.percentage;

                if (bestAttempt.passed && bestAttempt.percentage >= 70) {
                  passedQuizzes++;
                } else {
                  failedQuizzes++;
                  hasAnyFailedQuiz = true;
                  console.log(`Quiz failed in section ${section._id}: ${bestAttempt.percentage}%`);
                }
              } else {
                totalPossibleQuizScore += 100;

                // 🆕 ADD QUIZ NOT ATTEMPTED
                quizAttempts.push({
                  quizId: quizResult._id,
                  quizTitle: quizResult.title,
                  sectionTitle: section.title,
                  chapterTitle: chapter.title,
                  totalAttempts: 0,
                  maxAttempts: quizResult.maxAttempts,
                  bestScore: 0,
                  bestGrade: 'Not Attempted',
                  passed: false,
                  lastAttemptDate: null,
                  timeLimit: quizResult.timeLimit,
                  passingScore: quizResult.passingScore
                });
              }
            } else {
              totalPossibleQuizScore += 100;
            }
          }

          // Determine if section is completed
          let sectionCompleted = true;

          // Check content completion
          if (section.content && section.content.length > 0) {
            const sectionContentCount = section.content.length;
            const sectionCompletedContent = section.content.filter(content => {
              const contentProgress = sectionProgress?.contentProgress?.find(
                cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
              );

              if (!contentProgress) return false;

              if (content.contentType === 'video') {
                return contentProgress.watchedDuration >= content.minimumWatchTime;
              } else if (content.contentType === 'text') {
                return contentProgress.completed;
              }
              return false;
            }).length;

            if (sectionCompletedContent < sectionContentCount) {
              sectionCompleted = false;
            }
          }

          // NOTE: Quiz results do NOT lock progression. Section completion is content-only.

          if (sectionCompleted) {
            completedSections++;
          }
        }

        // ✅ CHECK CHAPTER-LEVEL QUIZ (after processing all sections in chapter)
        if (chapter.quiz) {
          totalQuizzes++;

          // Find actual quiz result from Quiz collection (chapter-level quiz has no sectionId)
          const quizResult = courseQuizResults.find(quiz =>
            quiz.chapterId && quiz.chapterId.toString() === chapter._id.toString() &&
            !quiz.sectionId // Chapter-level quiz has no sectionId
          );

          if (quizResult) {
            // Get user's attempts for this quiz
            const userAttempts = quizResult.attempts.filter(
              attempt => attempt.userId.toString() === userId
            );

            if (userAttempts.length > 0) {
              hasAnyQuizAttempt = true;

              // Get best attempt
              const bestAttempt = userAttempts.reduce((best, current) =>
                current.percentage > best.percentage ? current : best
              );

              // 🆕 ADD QUIZ ATTEMPT DETAILS
              quizAttempts.push({
                quizId: quizResult._id,
                quizTitle: quizResult.title,
                sectionTitle: null, // Chapter-level quiz has no section
                chapterTitle: chapter.title,
                totalAttempts: userAttempts.length,
                maxAttempts: quizResult.maxAttempts,
                bestScore: bestAttempt.percentage,
                bestGrade: bestAttempt.grade,
                passed: bestAttempt.passed,
                lastAttemptDate: bestAttempt.attemptDate,
                timeLimit: quizResult.timeLimit,
                passingScore: quizResult.passingScore
              });

              totalPossibleQuizScore += 100;
              totalQuizScore += bestAttempt.percentage;

              if (bestAttempt.passed && bestAttempt.percentage >= 70) {
                passedQuizzes++;
              } else {
                failedQuizzes++;
                hasAnyFailedQuiz = true;
                console.log(`Chapter quiz failed in chapter ${chapter._id}: ${bestAttempt.percentage}%`);
              }
            } else {
              totalPossibleQuizScore += 100;

              // 🆕 ADD QUIZ NOT ATTEMPTED
              quizAttempts.push({
                quizId: quizResult._id,
                quizTitle: quizResult.title,
                sectionTitle: null, // Chapter-level quiz has no section
                chapterTitle: chapter.title,
                totalAttempts: 0,
                maxAttempts: quizResult.maxAttempts,
                bestScore: 0,
                bestGrade: 'Not Attempted',
                passed: false,
                lastAttemptDate: null,
                timeLimit: quizResult.timeLimit,
                passingScore: quizResult.passingScore
              });
            }
          } else {
            totalPossibleQuizScore += 100;
          }
        }
      }

      // Calculate overall progress percentage
      let overallProgress = 0;
      if (totalSections > 0) {
        overallProgress = Math.round((completedSections / totalSections) * 100);
      }

      // ✅ USE ENROLLMENT.GRADEPERCENTAGE IF AVAILABLE (calculated by quiz controller)
      // Otherwise calculate from quiz results
      let gradePercentage = enrollment.gradePercentage || 0;
      if (gradePercentage === 0 && totalPossibleQuizScore > 0) {
        gradePercentage = Math.round((totalQuizScore / totalPossibleQuizScore) * 100);
      }

      // ✅ USE ENROLLMENT.GRADELABEL IF AVAILABLE
      // Otherwise determine grade label from percentage
      let gradeLabel = enrollment.gradeLabel || 'Incomplete';
      if (gradeLabel === 'Incomplete' && gradePercentage > 0) {
        if (gradePercentage >= 90) {
          gradeLabel = 'A';
        } else if (gradePercentage >= 80) {
          gradeLabel = 'B';
        } else if (gradePercentage >= 70) {
          gradeLabel = 'C';
        } else if (gradePercentage >= 60) {
          gradeLabel = 'D';
        } else {
          gradeLabel = 'F';
        }
      }

      // ✅ NO-QUIZ COURSES AUTO-PASS WITH 100%
      if (totalQuizzes === 0) {
        gradePercentage = 100;
        gradeLabel = 'A';
      }
      let status = 'Not Started';
      // ✅ NO-CONTENT/NO-QUIZ COURSES AUTO-COMPLETE WITH 100%
      const hasAnyContentOrQuiz = totalContent > 0 || totalQuizzes > 0;
      if (!hasAnyContentOrQuiz) {
        overallProgress = 100;
        gradePercentage = 100;
        gradeLabel = 'A';
        status = 'Completed';
        completedSections = totalSections;
        completedContent = totalContent;
      }

      // ✅ NO-CONTENT/NO-QUIZ COURSES AUTO-COMPLETE WITH 100% AND GRADE A
      // const hasAnyContentOrQuiz = totalContent > 0 || totalQuizzes > 0;
      // if (!hasAnyContentOrQuiz) {
      //   overallProgress = 100;
      //   gradePercentage = 100;
      //   gradeLabel = 'A';
      //   status = 'Completed';
      //   completedSections = totalSections;
      //   completedContent = totalContent;
      // }

      // ✅ STATUS (CONTENT-ONLY PROGRESSION)
      
      if (enrollment.certificateRequestStatus === 'Approved') {
        status = 'Done';
      } else if (overallProgress === 100) {
        status = 'Completed';
      } else if (overallProgress > 0) {
        status = 'In Progress';
      }

      // ✅ CERTIFICATE INFO (PROGRAM-LEVEL) - eligibility will be computed after all courses processed
      let certificateInfo = {
        eligible: false,
        requestStatus: enrollment.certificateRequestStatus || 'Not Eligible',
        requestId: enrollment.certificateRequestId || null,
        certificateRequest: null,
        canRequest: false
      };

      // If certificate request exists, get details
      if (enrollment.certificateRequestId && enrollment.certificateRequestId.status) {
        certificateInfo.certificateRequest = {
          id: enrollment.certificateRequestId._id,
          status: enrollment.certificateRequestId.status,
          certificateId: enrollment.certificateRequestId.certificateId,
          requestDate: enrollment.certificateRequestId.createdAt,
          approvalDate: enrollment.certificateRequestId.reviewedAt,
          certificateUrl: enrollment.certificateRequestId.certificateImagePath
        };
      }

      // Calculate weightage (include both section-level and chapter-level quizzes)
      let totalWeightage = 0;
      let quizCount = 0;

      if (course.chapters && Array.isArray(course.chapters)) {
        course.chapters.forEach(chapter => {
          // ✅ CHECK CHAPTER-LEVEL QUIZ
          if (chapter.quiz) {
            const chapterQuiz = courseQuizResults.find(q =>
              q.chapterId && q.chapterId.toString() === chapter._id.toString() &&
              !q.sectionId // Chapter-level quiz has no sectionId
            );
            if (chapterQuiz && chapterQuiz.weightage) {
              totalWeightage += chapterQuiz.weightage;
              quizCount++;
            }
          }

          // Check section-level quizzes
          if (chapter.sections && Array.isArray(chapter.sections)) {
            chapter.sections.forEach(section => {
              if (section.quiz) {
                const quiz = courseQuizResults.find(q =>
                  q.sectionId && q.sectionId.toString() === section._id.toString()
                );
                if (quiz && quiz.weightage) {
                  totalWeightage += quiz.weightage;
                  quizCount++;
                }
              }
            });
          }
        });
      }

      const avgWeightage = quizCount > 0 ? Math.round(totalWeightage / quizCount) : (course.weightage || 100);

      // Create course summary object
      // processedCourses.push({
      //   _id: course._id,
      //   name: course.name,
      //   description: course.description,
      //   thumbnail: course.thumbnail,
      //   level: course.level,
      //   courseType: course.courseType || 'Course',
      //   language: course.language,
      //   approximateHours: course.approximateHours,
      //   totalVideos: course.totalVideos,
      //   progress: overallProgress,
      //   gradePercentage: gradePercentage,
      //   gradeLabel: gradeLabel,
      //   status: status,
      //   weightage: avgWeightage,

      //   // 🆕 CERTIFICATE INFORMATION
      //   certificateInfo: certificateInfo,

      //    quizStats: {
      //     total: totalQuizzes,
      //     completed: passedQuizzes,
      //     failed: failedQuizzes,
      //     percentage: totalQuizzes > 0 ? Math.round((passedQuizzes / totalQuizzes) * 100) : 0,

      //     // 🆕 DETAILED QUIZ ATTEMPTS
      //     attempts: quizAttempts
      //   },

      //   contentStats: {
      //     totalSections: totalSections,
      //     completedSections: completedSections,
      //     totalContent: totalContent,
      //     completedContent: completedContent,
      //     sectionProgress: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
      //     contentProgress: totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0
      //   },

      //   enrollmentDate: enrollment.enrollmentDate,
      //   lastAccessDate: enrollment.lastAccessDate || enrollment.enrollmentDate
      // });

      processedCourses.push({
        _id: course._id,
        name: course.name,
        sequence: course.sequence,
        courseDuration: course.courseDuration,
        description: course.description,
        thumbnail: course.thumbnail,
        level: course.level,
        courseType: course.courseType || 'Course',
        language: course.language,
        approximateHours: course.approximateHours,
        totalVideos: course.totalVideos,
        progress: overallProgress,
        gradePercentage: gradePercentage,
        gradeLabel: gradeLabel,

        // 🆕 STATUS WITH PROPER DISPLAY NAMES
        status: status,
        statusDisplay: getStatusDisplay(status), // 🆕 HUMAN READABLE STATUS

        weightage: avgWeightage,

        // 🆕 CERTIFICATE INFORMATION
        certificateInfo: certificateInfo,

        quizStats: {
          total: totalQuizzes,
          completed: passedQuizzes,
          failed: failedQuizzes,
          percentage: totalQuizzes > 0 ? Math.round((passedQuizzes / totalQuizzes) * 100) : 0,
          attempts: quizAttempts
        },

        contentStats: {
          totalSections: totalSections,
          completedSections: completedSections,
          totalContent: totalContent,
          completedContent: completedContent,
          sectionProgress: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
          contentProgress: totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0
        },

        enrollmentDate: enrollment.enrollmentDate,
        lastAccessDate: enrollment.lastAccessDate || enrollment.enrollmentDate
      });

    }

    // Separate main courses and short courses
    const mainCourses = processedCourses.filter(course =>
      course.courseType === 'Course'
    );

    const shortCourses = processedCourses.filter(course =>
      course.courseType === 'Short Course'
    );

    // Enforce short-course remediation (must repeat until passing score)
    // const shortCoursePassMark = 70;
    // shortCourses.forEach(sc => {
    //   if ((sc.status === 'Completed' || sc.status === 'Done') && (sc.gradePercentage || 0) < shortCoursePassMark) {
    //     // sc.status = 'Failed';
    //     sc.statusDisplay = getStatusDisplay('Failed');
    //     // sc.requiresRetake = true;
    //     // sc.progress = 0;
    //     if (sc.contentStats) {
    //       sc.contentStats.sectionProgress = 0;
    //       sc.contentStats.contentProgress = 0;
    //       sc.contentStats.completedSections = 0;
    //       sc.contentStats.completedContent = 0;
    //     }
    //     sc.certificateInfo.eligible = false;
    //     sc.certificateInfo.canRequest = false;
    //   }
    // });

    // ✅ PROGRAM-LEVEL CERTIFICATE RULES (ALL ASSIGNED MAIN COURSES MUST BE COMPLETED)
    // Check if all assigned main courses (based on role/warehouse) are completed
    const assignedMainCourseIds = assignedMainCourses.map(c => c._id.toString());
    const enrolledMainCoursesMap = new Map(
      mainCourses.map(c => [c._id.toString(), c])
    );

    // Check if all assigned courses are enrolled and completed
    const allAssignedMainCoursesCompleted = assignedMainCourseIds.length > 0 && assignedMainCourseIds.every((assignedCourseId) => {
      const enrolledCourse = enrolledMainCoursesMap.get(assignedCourseId);
      if (!enrolledCourse) {
        // console.log(`Assigned course ${assignedCourseId} is not enrolled`);
        return false;
      }
      const isCompleted = enrolledCourse.status === 'Completed' || enrolledCourse.status === 'Done';
      const hasFullProgress = enrolledCourse.progress === 100;
      const result = isCompleted || hasFullProgress;
      if (!result) {
        // console.log(`Assigned course ${assignedCourseId} (${enrolledCourse.name}) not completed: status=${enrolledCourse.status}, progress=${enrolledCourse.progress}`);
      }
      return result;
    });
    // console.log(`allAssignedMainCoursesCompleted: ${allAssignedMainCoursesCompleted} (${assignedMainCourseIds.length} assigned, ${mainCourses.length} enrolled main courses)`);

    // Also check all enrolled main courses for backward compatibility (used for short course logic)
    const allMainCoursesCompleted = mainCourses.length > 0 && mainCourses.every((c) => {
      const isCompleted = c.status === 'Completed' || c.status === 'Done';
      const hasFullProgress = c.progress === 100;
      const result = isCompleted || hasFullProgress;
      if (!result) {
        console.log(`Course ${c._id} (${c.name}) not completed: status=${c.status}, progress=${c.progress}`);
      }
      return result;
    });
    // console.log(`allMainCoursesCompleted: ${allMainCoursesCompleted} (${mainCourses.length} main courses)`);

    // Track total quizzes across all main courses for zero-quiz edge case
    const totalQuizzesAcrossMain = mainCourses.reduce(
      (sum, c) => sum + (c.quizStats?.total || 0),
      0
    );

    // Overall percentage across all main courses (simple average of course gradePercentage)
    let programPercentage = 0;
    if (mainCourses.length > 0) {
      const sumGrades = mainCourses.reduce((sum, c) => sum + (c.gradePercentage || 0), 0);
      programPercentage = Math.round(sumGrades / mainCourses.length);
    }

    // If there are no quizzes at all but courses are completed, treat program as 100%
    if (totalQuizzesAcrossMain === 0 && allMainCoursesCompleted) {
      programPercentage = 100;
    }

    const passingThreshold = 70;
    // ✅ CERTIFICATE ELIGIBILITY: Must complete ALL ASSIGNED main courses (not just enrolled ones)
    let eligibleForCertificate =
      allAssignedMainCoursesCompleted &&
      (totalQuizzesAcrossMain === 0 || programPercentage >= passingThreshold);
    let requiresShortCourses =
      allAssignedMainCoursesCompleted &&
      totalQuizzesAcrossMain > 0 &&
      programPercentage < passingThreshold;

    // ✅ SHORT-COURSE REMEDIATION SUCCESS: if short courses exist, all completed, and avg >= 70, allow certificate
    if (requiresShortCourses && shortCourses.length > 0) {
      const allShortsCompleted = shortCourses.every(
        sc => sc.status === 'Completed' || sc.status === 'Done' || sc.progress === 100
      );
      if (allShortsCompleted) {
        const shortAvg = Math.round(
          shortCourses.reduce((sum, sc) => sum + (sc.gradePercentage || 0), 0) / shortCourses.length
        );
        if (shortAvg >= passingThreshold) {
          eligibleForCertificate = true;
          requiresShortCourses = false;
          programPercentage = passingThreshold; // lift to passing
        }
      }
    }

    // ✅ PROCESS SHORT COURSES: Add lock/unlock logic based on assigned main course completion and program percentage
    // console.log(`Short course unlock check: allAssignedMainCoursesCompleted=${allAssignedMainCoursesCompleted}, programPercentage=${programPercentage}, passingThreshold=${passingThreshold}`);
    shortCourses.forEach((sc) => {
      // Short course is locked by default
      sc.isLocked = true;
      sc.lockReason = 'Complete all main courses first';
      
      // Short course unlocks ONLY if:
      // 1. All assigned main courses are completed
      // 2. Program percentage < 70 (needs remediation)
      // 3. Short course is not already completed/passed (grade < 70% AND progress < 100%)
      if (allAssignedMainCoursesCompleted) {
        if (programPercentage < passingThreshold) {
          // Check if short course is already completed or passed
          const isShortCourseCompleted = sc.status === 'Completed' || sc.status === 'Done' || sc.progress === 100;
          const isShortCoursePassed = (sc.gradePercentage || 0) >= passingThreshold;
          
          // Unlock ONLY if short course is NOT completed AND NOT passed
          // This means the short course needs remediation
          if (!isShortCourseCompleted && !isShortCoursePassed) {
            // Short course is unlocked for remediation
            sc.isLocked = false;
            sc.lockReason = null;
            console.log(`Short course ${sc._id} unlocked for remediation (progress: ${sc.progress}%, grade: ${sc.gradePercentage}%)`);
          } else {
            // Short course is already completed/passed, so it's accessible but show as completed
            sc.isLocked = false;
            sc.lockReason = 'Already completed';
            console.log(`Short course ${sc._id} already completed/passed (progress: ${sc.progress}%, grade: ${sc.gradePercentage}%)`);
          }
        } else {
          // Program percentage >= 70, short courses not needed
          sc.isLocked = true;
          sc.lockReason = 'Program percentage is 70% or above. Short courses not required.';
          console.log(`Short course ${sc._id} locked: Program percentage (${programPercentage}%) >= ${passingThreshold}%`);
        }
      } else {
        // Not all main courses completed yet
        sc.isLocked = true;
        sc.lockReason = 'Complete all main courses first';
        console.log(`Short course ${sc._id} locked: Not all main courses completed`);
      }
    });

      // Anchor course = last by sequence; only this course can request certificate
    const sortedMainCourses = [...mainCourses].sort(
      (a, b) => (a.sequence || 0) - (b.sequence || 0)
    );
    const anchorCourseId =
      sortedMainCourses.length > 0
        ? sortedMainCourses[sortedMainCourses.length - 1]._id.toString()
        : null;

    // Process main courses for certificate eligibility
    processedCourses.forEach((c) => {
      if (c.courseType !== 'Course') {
        c.certificateInfo.eligible = false;
        c.certificateInfo.canRequest = false;
        c.certificateInfo.requiresShortCourses = false;
        return;
      }

      const isAnchor = anchorCourseId && c._id.toString() === anchorCourseId;
      const baseEligible = isAnchor && eligibleForCertificate;

      // Only expose remediation flag on anchor course to avoid repeating CTA on every course
      c.certificateInfo.requiresShortCourses = isAnchor ? requiresShortCourses : false;
      c.certificateInfo.eligible = baseEligible;
      c.certificateInfo.canRequest =
        baseEligible &&
        !requiresShortCourses &&
        (c.status === 'Completed' || c.status === 'Done' || c.progress === 100) &&
        c.certificateInfo.requestStatus !== 'Requested' &&
        c.certificateInfo.requestStatus !== 'Approved';
    });

    console.log(`Processed ${mainCourses.length} main courses and ${shortCourses.length} short courses`);
    res.status(200).json({
      success: true,
      message: 'Course progress retrieved successfully',
      data: {
        mainCourses: mainCourses,
        shortCourses: shortCourses,
        summary: {
          totalCourses: processedCourses.length,
          mainCoursesCount: mainCourses.length,
          shortCoursesCount: shortCourses.length,
          completedCourses: processedCourses.filter(c => c.status === 'Completed').length,
          inProgressCourses: processedCourses.filter(c => c.status === 'In Progress').length,
          failedCourses: processedCourses.filter(c => c.status === 'Failed').length,

          // 🆕 CERTIFICATE SUMMARY
          certificateEligible: processedCourses.filter(c => c.certificateInfo.eligible).length,
          certificateRequested: processedCourses.filter(c => c.certificateInfo.requestStatus === 'Requested').length,
          certificateApproved: processedCourses.filter(c => c.certificateInfo.requestStatus === 'Approved').length,

          // ✅ PROGRAM SUMMARY
          programStats: {
            totalMainCourses: mainCourses.length,
            totalAssignedMainCourses: assignedMainCourseIds.length,
            totalQuizzes: totalQuizzesAcrossMain,
            allMainCoursesCompleted,
            allAssignedMainCoursesCompleted,
            percentage: programPercentage,
            passingThreshold,
            eligibleForCertificate,
            requiresShortCourses,
            anchorCourseId
          }
        }
      }
    });

  } catch (error) {
    console.error('Error getting course progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get course progress',
      error: error.message
    });
  }
};



const getStatusDisplay = (status) => {
  const statusMap = {
    'Not Started': 'Not Started',
    'In Progress': 'In Progress',
    'Completed': 'Completed',
    'Failed': 'Failed',
    'Requested': 'Certificate Requested',
    'Done': 'Done'
  };
  return statusMap[status] || status;
};



const getAssignedCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoleId = req.user.role;
    const userWarehouseId = req.user.warehouse;

    // Find all courses that are assigned to the user's role or warehouse
    const courses = await Course.find({
      isActive: true,
      $or: [
        { 'accessControl.roles': userRoleId },
        { 'accessControl.stores': userWarehouseId }
      ]
    }).select('name description thumbnail level courseType language approximateHours totalVideos status enrolledUsers');

    // Process courses to include user's progress
    const processedCourses = courses.map(course => {
      const courseObj = course.toObject();

      // Find user's enrollment in this course
      const enrollment = course.enrolledUsers.find(
        e => e.user && e.user.toString() === userId
      );

      // Add progress information if user is enrolled
      if (enrollment) {
        courseObj.userProgress = {
          progress: enrollment.progress || 0,
          gradePercentage: enrollment.gradePercentage || 0,
          gradeLabel: enrollment.gradeLabel || 'Incomplete',
          status: enrollment.progress === 100 ?
            (enrollment.gradePercentage >= course.passingGrade ? 'Completed' : 'Failed') :
            (enrollment.progress === 0 ? 'Not Started' : 'In Progress')
        };
      } else {
        courseObj.userProgress = {
          progress: 0,
          gradePercentage: 0,
          gradeLabel: 'Not Started',
          status: 'Not Started'
        };
      }

      // Remove enrolledUsers array from response
      delete courseObj.enrolledUsers;

      return courseObj;
    });

    res.status(200).json({
      success: true,
      count: processedCourses.length,
      data: processedCourses
    });
  } catch (error) {
    console.error('Error getting assigned courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting assigned courses',
      error: error.message
    });
  }
};



// get course details:
const getCourseDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRoleId = req.user.role;
    const userWarehouseId = req.user.warehouse;

    // Find the course by ID with all details
    const course = await Course.findById(id)
      .populate('chapters.sections.quiz', 'title description timeLimit passingScore')
      .populate('accessControl.roles', 'role_name')
      .populate('accessControl.stores', 'name');

    console.log('course data', course)

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user has access to this course based on role or warehouse
    const hasRoleAccess = course.accessControl.roles.some(
      role => role._id.toString() === userRoleId.toString()
    );

    const hasWarehouseAccess = userWarehouseId && course.accessControl.stores.some(
      store => store._id.toString() === userWarehouseId.toString()
    );

    if (!hasRoleAccess && !hasWarehouseAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this course'
      });
    }

    // Check if user is already enrolled
    let userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user && enrollment.user.toString() === userId.toString()
    );

    // If not enrolled but has access, auto-enroll the user
    if (!userEnrollment && (hasRoleAccess || hasWarehouseAccess)) {
      // Create enrollment structure
      const newEnrollment = {
        user: userId,
        enrollmentDate: new Date(),
        progress: 0,
        currentChapter: 0,
        currentSection: 0,
        currentContent: 0,
        chapterProgress: course.chapters.map(chapter => ({
          chapterId: chapter._id,
          sequence: chapter.sequence,
          completed: false,
          sectionProgress: chapter.sections.map(section => ({
            sectionId: section._id,
            sequence: section.sequence,
            completed: false,
            contentProgress: section.content.map(content => ({
              contentId: content._id,
              sequence: content.sequence,
              watchedDuration: 0,
              completed: false
            })),
            quizProgress: section.quiz ? {
              quizId: section.quiz,
              attempts: 0,
              bestScore: 0,
              passed: false
            } : null
          }))
        })),
        overallGrade: 0,
        gradePercentage: 0,
        gradeLabel: 'Incomplete'
      };

      // Update the course with the new enrollment
      course.enrolledUsers.push(newEnrollment);
      await course.save();

      // Set the user enrollment to the newly created one
      userEnrollment = newEnrollment;
    }

    // Convert to plain object so we can modify it
    const courseData = course.toObject();

    // Add enrollment status and details
    courseData.isEnrolled = !!userEnrollment;

    if (userEnrollment) {
      courseData.enrollmentDetails = {
        progress: userEnrollment.progress,
        currentChapter: userEnrollment.currentChapter,
        currentSection: userEnrollment.currentSection,
        currentContent: userEnrollment.currentContent,
        gradePercentage: userEnrollment.gradePercentage,
        gradeLabel: userEnrollment.gradeLabel,
        certificateEarned: userEnrollment.certificateEarned,
        enrollmentDate: userEnrollment.enrollmentDate
      };
    }

    // Remove enrolled users array to reduce response size
    delete courseData.enrolledUsers;

    res.status(200).json({
      success: true,
      data: courseData
    });
  } catch (error) {
    console.error('Error getting course details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting course details',
      error: error.message
    });
  }
};


const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('enrolledUsers.user', 'username email')
      .populate('accessControl.roles', 'role_name description')
      .populate('accessControl.stores', 'name location address');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.status(200).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// get quiz section by id check krna ha 
const getQuizBySection = async (req, res) => {
  try {
    const { courseId, chapterId, sectionId } = req.params;
    const userId = req.user.id;

    // Find quiz by section ID
    const quiz = await Quiz.findOne({
      courseId: courseId,
      chapterId: chapterId,
      sectionId: sectionId
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'No quiz found for this section'
      });
    }

    // Get user's previous attempts
    const userAttempts = quiz.attempts.filter(attempt =>
      attempt.userId.toString() === userId.toString()
    );

    // Attempts are unlimited (maxAttempts is ignored for user flow)
    const attemptsRemaining = null;
    const canAttempt = true;

    // Get best score from previous attempts
    let bestScore = 0;
    let bestGrade = null;
    let hasPassed = false;

    if (userAttempts.length > 0) {
      bestScore = Math.max(...userAttempts.map(a => a.percentage || 0));
      const bestAttempt = userAttempts.reduce((best, current) => {
        return (current.percentage > (best?.percentage || 0)) ? current : best;
      }, null);

      if (bestAttempt) {
        bestGrade = bestAttempt.grade;
        hasPassed = bestAttempt.passed;
      }
    }

    // Return quiz details without correct answers
    const quizDetails = {
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      timeLimit: quiz.timeLimit,
      maxAttempts: null,
      passingScore: quiz.passingScore,
      totalQuestions: quiz.questions.length,
      totalPoints: quiz.questions.reduce((sum, q) => sum + q.points, 0),
      attemptsUsed: userAttempts.length,
      attemptsRemaining: attemptsRemaining,
      canAttempt: canAttempt,
      bestScore: bestScore,
      bestGrade: bestGrade,
      hasPassed: hasPassed
    };

    res.status(200).json({
      success: true,
      data: quizDetails
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz details',
      error: error.message
    });
  }
};


// const updateCourse = async (req, res) => {
//     try {
//         console.log('Received request to update course:', req.body);
//         console.log('Received request files:', req.files);

//         const courseId = req.params.id;
//         if (!mongoose.Types.ObjectId.isValid(courseId)) {
//             return res.status(400).json({ message: 'Invalid course ID' });
//         }

//         // Find the existing course
//         const existingCourse = await Course.findById(courseId);
//         if (!existingCourse) {
//             return res.status(404).json({ message: 'Course not found' });
//         }

//         const {
//             name,
//             description,
//             approximateHours,
//             sequence,
//             passingGrade,
//             accessControl,
//             chapters,
//             courseType
//         } = req.body;

//         // Handle fields with different names
//         const level = req.body.level || req.body['level '] || req.body.levelValue;
//         const language = req.body.language || req.body['language '] || req.body.languageValue;

//         // Create update object with basic fields
//         const updateData = {};
//         if (name) updateData.name = name;
//         if (description) updateData.description = description;
//         if (approximateHours) updateData.approximateHours = approximateHours;
//         if (level) updateData.level = level;
//         if (courseType) updateData.courseType = courseType;
//         if (language) updateData.language = language;
//         if (sequence) updateData.sequence = sequence;
//         if (passingGrade) updateData.passingGrade = passingGrade;

//         // Handle course thumbnail update if provided
//         if (req.files && req.files.length > 0) {
//             const courseThumbnailFile = req.files.find(file => file.fieldname === 'courseThumbnail');
//             if (courseThumbnailFile) {
//                 updateData.thumbnail = courseThumbnailFile.path.replace(/\\/g, '/');
//             }
//         }

//         // Parse access control if provided
//         if (accessControl) {
//             let parsedAccessControl = { roles: [], stores: [] };

//             if (typeof accessControl === 'string') {
//                 parsedAccessControl = JSON.parse(accessControl);
//             } else {
//                 // If accessControl is provided as form fields
//                 if (accessControl.roles) {
//                     // Convert role IDs to ObjectId if they're valid MongoDB IDs
//                     parsedAccessControl.roles = Array.isArray(accessControl.roles) 
//                         ? accessControl.roles.map(roleId => {
//                             // Check if it's a valid MongoDB ObjectId
//                             if (mongoose.Types.ObjectId.isValid(roleId)) {
//                                 return new mongoose.Types.ObjectId(roleId);
//                             }
//                             return roleId;
//                         })
//                         : [accessControl.roles];
//                 }

//                 if (accessControl.stores) {
//                     // Convert store IDs to ObjectId
//                     parsedAccessControl.stores = Array.isArray(accessControl.stores) 
//                         ? accessControl.stores.map(storeId => new mongoose.Types.ObjectId(storeId))
//                         : [new mongoose.Types.ObjectId(accessControl.stores)];
//                 }
//             }

//             updateData.accessControl = parsedAccessControl;
//         }

//         // Process chapters if provided
//        if (chapters) {
//             let parsedChapters = [];
//             if (typeof chapters === 'string') {
//                 parsedChapters = JSON.parse(chapters);
//             } else {
//                 parsedChapters = chapters;
//             }

//             if (Array.isArray(parsedChapters)) {
//                 // For partial updates, we need to work with a copy of the existing chapters
//                 let processedChapters = JSON.parse(JSON.stringify(existingCourse.chapters));
//                 let totalVideos = 0;

//                 // Process each chapter in the request
//                 for (let i = 0; i < parsedChapters.length; i++) {
//                     const chapter = parsedChapters[i];

//                     // If chapter has an ID, it's an update to an existing chapter
//                     if (chapter._id) {
//                         const chapterIndex = processedChapters.findIndex(
//                             c => c._id.toString() === chapter._id.toString()
//                         );

//                         if (chapterIndex !== -1) {
//                             // Update the existing chapter with new values
//                             if (chapter.title) processedChapters[chapterIndex].title = chapter.title;
//                             if (chapter.description !== undefined) processedChapters[chapterIndex].description = chapter.description;
//                             if (chapter.sequence) processedChapters[chapterIndex].sequence = chapter.sequence;

//                             // Process sections if provided
//                             if (chapter.sections && Array.isArray(chapter.sections)) {
//                                 for (let j = 0; j < chapter.sections.length; j++) {
//                                     const section = chapter.sections[j];

//                                     // If section has an ID, it's an update to an existing section
//                                     if (section._id) {
//                                         const sectionIndex = processedChapters[chapterIndex].sections.findIndex(
//                                             s => s._id.toString() === section._id.toString()
//                                         );

//                                         if (sectionIndex !== -1) {
//                                             // Update the existing section with new values
//                                             if (section.title) processedChapters[chapterIndex].sections[sectionIndex].title = section.title;
//                                             if (section.sequence) processedChapters[chapterIndex].sections[sectionIndex].sequence = section.sequence;
//                                             if (section.introduction) processedChapters[chapterIndex].sections[sectionIndex].introduction = section.introduction;
//                                             if (section.quiz) processedChapters[chapterIndex].sections[sectionIndex].quiz = section.quiz;

//                                             // Process content if provided
//                                             if (section.content && Array.isArray(section.content)) {
//                                                 for (let k = 0; k < section.content.length; k++) {
//                                                     const content = section.content[k];

//                                                     // If content has an ID, it's an update to existing content
//                                                     if (content._id) {
//                                                         const contentIndex = processedChapters[chapterIndex].sections[sectionIndex].content.findIndex(
//                                                             c => c._id.toString() === content._id.toString()
//                                                         );

//                                                         if (contentIndex !== -1) {
//                                                             // Update the existing content with new values
//                                                             if (content.title) processedChapters[chapterIndex].sections[sectionIndex].content[contentIndex].title = content.title;
//                                                             if (content.description !== undefined) processedChapters[chapterIndex].sections[sectionIndex].content[contentIndex].description = content.description;
//                                                             if (content.sequence) processedChapters[chapterIndex].sections[sectionIndex].content[contentIndex].sequence = content.sequence;
//                                                             if (content.contentType) processedChapters[chapterIndex].sections[sectionIndex].content[contentIndex].contentType = content.contentType;
//                                                             if (content.textContent !== undefined) processedChapters[chapterIndex].sections[sectionIndex].content[contentIndex].textContent = content.textContent;

//                                                             // For video content, check for new files
//                                                             if (content.contentType === 'video') {
//                                                                 // Count this video
//                                                                 totalVideos++;

//                                                                 // Check for new video file
//                                                                 const videoFieldName = `chapter_video_${i}_section_${j}_content_${k}`;
//                                                                 if (req.files && req.files.length > 0) {
//                                                                     const videoFile = req.files.find(file => 
//                                                                         file.fieldname === videoFieldName || 
//                                                                         file.fieldname === `${videoFieldName} `
//                                                                     );

//                                                                     if (videoFile) {
//                                                                         processedChapters[chapterIndex].sections[sectionIndex].content[contentIndex].videoUrl = videoFile.path.replace(/\\/g, '/');
//                                                                     }

//                                                                     // Check for new thumbnail file
//                                                                     const thumbnailFieldName = `content_thumbnail_${i}_section_${j}_content_${k}`;
//                                                                     const thumbnailFile = req.files.find(file => 
//                                                                         file.fieldname === thumbnailFieldName || 
//                                                                         file.fieldname === `${thumbnailFieldName} `
//                                                                     );

//                                                                     if (thumbnailFile) {
//                                                                         processedChapters[chapterIndex].sections[sectionIndex].content[contentIndex].thumbnail = thumbnailFile.path.replace(/\\/g, '/');
//                                                                     }
//                                                                 }
//                                                             }
//                                                         }
//                                                     } else {
//                                                         // This is a new content item, validate required fields
//                                                         if (!content.title || !content.contentType || !content.sequence) {
//                                                             return res.status(400).json({ message: `New content item in Section ${j+1}, Chapter ${i+1} is missing required fields` });
//                                                         }

//                                                         const newContent = { ...content };

//                                                         // For video content, process files
//                                                         if (content.contentType === 'video') {
//                                                             const videoFieldName = `chapter_video_${i}_section_${j}_content_${k}`;
//                                                             const thumbnailFieldName = `content_thumbnail_${i}_section_${j}_content_${k}`;

//                                                             if (req.files && req.files.length > 0) {
//                                                                 const videoFile = req.files.find(file => 
//                                                                     file.fieldname === videoFieldName || 
//                                                                     file.fieldname === `${videoFieldName} `
//                                                                 );

//                                                                 if (videoFile) {
//                                                                     newContent.videoUrl = videoFile.path.replace(/\\/g, '/');
//                                                                     totalVideos++;
//                                                                 } else {
//                                                                     return res.status(400).json({ 
//                                                                         message: `Video file missing for new content item in Section ${j+1}, Chapter ${i+1}`,
//                                                                         expectedFieldName: videoFieldName
//                                                                     });
//                                                                 }

//                                                                 // Check for thumbnail file (optional)
//                                                                 const thumbnailFile = req.files.find(file => 
//                                                                     file.fieldname === thumbnailFieldName || 
//                                                                     file.fieldname === `${thumbnailFieldName} `
//                                                                 );

//                                                                 if (thumbnailFile) {
//                                                                     newContent.thumbnail = thumbnailFile.path.replace(/\\/g, '/');
//                                                                 }
//                                                             } else {
//                                                                 return res.status(400).json({ message: `Video file missing for new content item in Section ${j+1}, Chapter ${i+1}` });
//                                                             }
//                                                         }

//                                                         // Add the new content item
//                                                         processedChapters[chapterIndex].sections[sectionIndex].content.push(newContent);
//                                                     }
//                                                 }
//                                             }
//                                         }
//                                     } else {
//                                         // This is a new section, validate required fields
//                                         if (!section.title || !section.sequence || !section.introduction) {
//                                             return res.status(400).json({ message: `New section in Chapter ${i+1} is missing required fields` });
//                                         }

//                                         // Process content for the new section
//                                         const processedContent = [];

//                                         if (section.content && Array.isArray(section.content)) {
//                                             for (let k = 0; k < section.content.length; k++) {
//                                                 const content = section.content[k];

//                                                 if (!content.title || !content.contentType || !content.sequence) {
//                                                     return res.status(400).json({ message: `Content item ${k+1} in new Section, Chapter ${i+1} is missing required fields` });
//                                                 }

//                                                 const processedContentItem = { ...content };

//                                                 // For video content, process files
//                                                 if (content.contentType === 'video') {
//                                                     const videoFieldName = `chapter_video_${i}_section_${j}_content_${k}`;
//                                                     const thumbnailFieldName = `content_thumbnail_${i}_section_${j}_content_${k}`;

//                                                     if (req.files && req.files.length > 0) {
//                                                         const videoFile = req.files.find(file => 
//                                                             file.fieldname === videoFieldName || 
//                                                             file.fieldname === `${videoFieldName} `
//                                                         );

//                                                         if (videoFile) {
//                                                             processedContentItem.videoUrl = videoFile.path.replace(/\\/g, '/');
//                                                             totalVideos++;
//                                                         } else {
//                                                             return res.status(400).json({ 
//                                                                 message: `Video file missing for content item ${k+1} in new Section, Chapter ${i+1}`,
//                                                                 expectedFieldName: videoFieldName
//                                                             });
//                                                         }

//                                                         // Check for thumbnail file (optional)
//                                                         const thumbnailFile = req.files.find(file => 
//                                                             file.fieldname === thumbnailFieldName || 
//                                                             file.fieldname === `${thumbnailFieldName} `
//                                                         );

//                                                         if (thumbnailFile) {
//                                                             processedContentItem.thumbnail = thumbnailFile.path.replace(/\\/g, '/');
//                                                         }
//                                                     } else {
//                                                         return res.status(400).json({ message: `Video file missing for content item ${k+1} in new Section, Chapter ${i+1}` });
//                                                     }
//                                                 }

//                                                 processedContent.push(processedContentItem);
//                                             }
//                                         }

//                                         // Add the new section
//                                         processedChapters[chapterIndex].sections.push({
//                                             ...section,
//                                             content: processedContent
//                                         });
//                                     }
//                                 }
//                             }
//                         }
//                     } else {
//                         // This is a new chapter, validate required fields
//                         if (!chapter.title || !chapter.sequence || !chapter.sections || !Array.isArray(chapter.sections)) {
//                             return res.status(400).json({ message: `New chapter is missing required fields` });
//                         }

//                         // Process sections for the new chapter
//                         const processedSections = [];

//                         for (let j = 0; j < chapter.sections.length; j++) {
//                             const section = chapter.sections[j];

//                         if (!section.title || !section.sequence || !section.introduction) {
//                                 return res.status(400).json({ message: `Section ${j+1} in new Chapter is missing required fields` });
//                             }

//                             const processedContent = [];

//                             if (section.content && Array.isArray(section.content)) {
//                                 for (let k = 0; k < section.content.length; k++) {
//                                     const content = section.content[k];

//                                     if (!content.title || !content.contentType || !content.sequence) {
//                                         return res.status(400).json({ message: `Content item ${k+1} in Section ${j+1}, new Chapter is missing required fields` });
//                                     }

//                                     const processedContentItem = { ...content };

//                                     // Process video content
//                                     if (content.contentType === 'video') {
//                                         const videoFieldName = `chapter_video_${i}_section_${j}_content_${k}`;
//                                         const thumbnailFieldName = `content_thumbnail_${i}_section_${j}_content_${k}`;

//                                         if (req.files && req.files.length > 0) {
//                                             const videoFile = req.files.find(file => 
//                                                 file.fieldname === videoFieldName || 
//                                                 file.fieldname === `${videoFieldName} `
//                                             );

//                                             if (videoFile) {
//                                                 processedContentItem.videoUrl = videoFile.path.replace(/\\/g, '/');
//                                                 totalVideos++;
//                                             } else {
//                                                 return res.status(400).json({ 
//                                                     message: `Video file missing for content item ${k+1} in Section ${j+1}, new Chapter`,
//                                                     expectedFieldName: videoFieldName
//                                                 });
//                                             }

//                                             // Check for thumbnail file (optional)
//                                             const thumbnailFile = req.files.find(file => 
//                                                 file.fieldname === thumbnailFieldName || 
//                                                 file.fieldname === `${thumbnailFieldName} `
//                                             );

//                                             if (thumbnailFile) {
//                                                 processedContentItem.thumbnail = thumbnailFile.path.replace(/\\/g, '/');
//                                             }
//                                         } else {
//                                             return res.status(400).json({ message: `Video file missing for content item ${k+1} in Section ${j+1}, new Chapter` });
//                                         }
//                                     }

//                                     processedContent.push(processedContentItem);
//                                 }
//                             }

//                             processedSections.push({
//                                 ...section,
//                                 content: processedContent
//                             });
//                         }

//                         // Add the new chapter
//                         processedChapters.push({
//                             ...chapter,
//                             sections: processedSections
//                         });
//                     }
//                 }

//                 // Count videos in existing chapters that weren't updated
//                 if (totalVideos === 0) {
//                     // If no new videos were added, count existing videos
//                     processedChapters.forEach(chapter => {
//                         chapter.sections.forEach(section => {
//                             section.content.forEach(content => {
//                                 if (content.contentType === 'video' && content.videoUrl) {
//                                     totalVideos++;
//                                 }
//                             });
//                         });
//                     });
//                 }

//                 updateData.chapters = processedChapters;
//                 updateData.totalVideos = totalVideos;
//             }
//         }


//         // Update the course
//         const updatedCourse = await Course.findByIdAndUpdate(
//             courseId,
//             { $set: updateData },
//             { new: true, runValidators: true }
//         );

//         if (!updatedCourse) {
//             return res.status(404).json({ message: 'Course not found after update attempt' });
//         }

//         console.log('✅ Course updated successfully, now sending notifications...');

//         res.status(200).json({
//             success: true,
//             message: 'Course updated successfully',
//             course: {
//                 id: updatedCourse._id,
//                 name: updatedCourse.name,
//                 totalChapters: updatedCourse.chapters.length,
//                 totalVideos: updatedCourse.totalVideos
//             }
//         });

//         try {
//             const notificationResult = await sendCourseAssignmentEmails(updatedCourse, 'update');
//             console.log('📧 Update notification result:', notificationResult);
//         } catch (notificationError) {
//             console.error('❌ Error sending update notifications:', notificationError);
//             // Don't fail the course update if notifications fail
//         }
//     } catch (error) {
//         console.error('Error updating course:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to update course',
//             error: error.message
//         });
//     }
// };



const updateCourse = async (req, res) => {
  try {
    // console.log('Received request to update course:', req.body);
    // console.log('Received request files:', req.files);

    const courseId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'Invalid course ID' });
    }

    // Find the existing course
    const existingCourse = await Course.findById(courseId);
    if (!existingCourse) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    const {
      name,
      description,
      courseDuration,
      approximateHours,
      sequence,
      passingGrade,
      accessControl,
      chapters,
      courseType
    } = req.body;

    // Handle fields with different names
    const level = req.body.level || req.body['level '] || req.body.levelValue;
    const language = req.body.language || req.body['language '] || req.body.languageValue;

    // Create update object with basic fields
    const updateData = {};
    if (name) updateData.name = name;
    if (courseDuration) updateData.courseDuration = courseDuration;
    if (description) updateData.description = description;
    if (approximateHours) updateData.approximateHours = approximateHours;
    if (level) updateData.level = level;
    if (courseType) updateData.courseType = courseType;
    if (language) updateData.language = language;
    if (sequence) updateData.sequence = sequence;
    if (passingGrade) updateData.passingGrade = passingGrade;

    // Handle course thumbnail update if provided
    if (req.files && req.files.length > 0) {
      const courseThumbnailFile = req.files.find(file => file.fieldname === 'courseThumbnail');
      if (courseThumbnailFile) {
        updateData.thumbnail = courseThumbnailFile.path.replace(/\\/g, '/');
      }
    }

    // Parse access control if provided
    if (accessControl) {
      let parsedAccessControl = { roles: [], stores: [] };

      if (typeof accessControl === 'string') {
        parsedAccessControl = JSON.parse(accessControl);
      } else {
        if (accessControl.roles) {
          parsedAccessControl.roles = Array.isArray(accessControl.roles)
            ? accessControl.roles.map(roleId => {
              if (mongoose.Types.ObjectId.isValid(roleId)) {
                return new mongoose.Types.ObjectId(roleId);
              }
              return roleId;
            })
            : [accessControl.roles];
        }

        if (accessControl.stores) {
          parsedAccessControl.stores = Array.isArray(accessControl.stores)
            ? accessControl.stores.map(storeId => new mongoose.Types.ObjectId(storeId))
            : [new mongoose.Types.ObjectId(accessControl.stores)];
        }
      }

      updateData.accessControl = parsedAccessControl;
    }

    // Process chapters if provided
    let parsedChapters = [];
    if (chapters) {
      // If chapters is a string (JSON), parse as before
      if (typeof chapters === 'string') {
        try {
          parsedChapters = JSON.parse(chapters);
        } catch (parseError) {
          return res.status(400).json({
            message: 'Invalid chapters JSON format',
            error: parseError.message
          });
        }
      } else if (Array.isArray(chapters)) {
        parsedChapters = chapters;
      }
    } else if (Object.keys(req.body).some(k => k.startsWith('chapters['))) {
      // If chapters is not present as a string/array, but indexed fields are present, use convertFormDataToChapters
      // Extract all chapters-related fields
      const chaptersObj = {};
      Object.keys(req.body).forEach(key => {
        if (key.startsWith('chapters[')) {
          // Convert chapters[0][sections][0][title] to 0.sections.0.title
          const path = key.replace(/^chapters\[(\d+)\]/, '$1')
            .replace(/\]\[/g, '.')
            .replace(/\[|\]/g, '');
          chaptersObj[path] = req.body[key];
        }
      });
      parsedChapters = convertFormDataToChapters(chaptersObj);
    }
    if (parsedChapters && parsedChapters.length > 0) {
      // ========================================================================
      // Process and upload videos to Bunny Stream
      // ========================================================================
      console.log('[Course Update] Processing video uploads...');
      const videoProcessingResult = await processAndUploadCourseVideos(
        req,
        courseId, // courseId for MongoDB updates
        parsedChapters
      );

      // Update parsedChapters with HLS URLs from video processing
      parsedChapters = videoProcessingResult.chapters;

      // Check for upload errors
      if (videoProcessingResult.errors && videoProcessingResult.errors.length > 0) {
        const firstError = videoProcessingResult.errors[0];
        return res.status(500).json({
          message: `Failed to upload video: ${firstError.contentTitle}`,
          error: firstError.error,
          contentTitle: firstError.contentTitle,
          chapterIndex: firstError.chapterIndex + 1,
          sectionIndex: firstError.sectionIndex + 1,
          contentIndex: firstError.contentIndex + 1,
          allErrors: videoProcessingResult.errors
        });
      }
      
      const totalVideos = videoProcessingResult.totalVideos;
      updateData.chapters = parsedChapters;
      updateData.totalVideos = totalVideos;

      console.log(`[Course Update] ✅ Video processing complete. ${videoProcessingResult.successCount} video(s) uploaded, ${totalVideos} total videos in course`);
    }

    // Update the course
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedCourse) {
      return res.status(404).json({ message: 'Course not found after update attempt' });
    }

    console.log('✅ Course updated successfully');

    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      course: {
        id: updatedCourse._id,
        name: updatedCourse.name,
        totalChapters: updatedCourse.chapters.length,
        totalVideos: updatedCourse.totalVideos
      }
    });

  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update course',
      error: error.message
    });
  }
};

// Helper function to convert form data to chapters array
function convertFormDataToChapters(chaptersObj) {
  const chaptersArray = [];

  // Extract chapter indices
  const chapterIndices = new Set();
  Object.keys(chaptersObj).forEach(key => {
    const match = key.match(/^(\d+)/);
    if (match) {
      chapterIndices.add(parseInt(match[1]));
    }
  });

  // Process each chapter
  chapterIndices.forEach(chapterIndex => {
    const chapter = {};

    // Extract chapter fields
    Object.keys(chaptersObj).forEach(key => {
      if (key.startsWith(`${chapterIndex}.`)) {
        const fieldPath = key.substring(`${chapterIndex}.`.length);
        setNestedValue(chapter, fieldPath, chaptersObj[key]);
      }
    });

    chaptersArray[chapterIndex] = chapter;
  });

  return chaptersArray.filter(chapter => chapter && Object.keys(chapter).length > 0);
}

// Helper function to set nested object values
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      // Check if next key is a number (array index)
      const nextKey = keys[i + 1];
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

// Helper function to process sections for existing chapters
async function processChapterSections(sections, existingChapter, chapterIndex, files) {
  console.log(`Processing ${sections.length} sections for chapter ${chapterIndex}`);

  for (let j = 0; j < sections.length; j++) {
    const section = sections[j];

    if (!section || (typeof section === 'object' && Object.keys(section).length === 0)) {
      console.log(`Section ${j} is empty/undefined, skipping...`);
      continue;
    }

    console.log(`Processing section ${j}:`, {
      hasId: !!section._id,
      title: section.title,
      hasContent: !!section.content,
      contentLength: section.content ? section.content.length : 0
    });

    // If section has an ID, it's an update to an existing section
    if (section._id && mongoose.Types.ObjectId.isValid(section._id)) {
      const sectionIndex = existingChapter.sections.findIndex(
        s => s._id && s._id.toString() === section._id.toString()
      );

      if (sectionIndex !== -1) {
        console.log(`Updating existing section at index ${sectionIndex}`);

        // Update existing section
        if (section.title) existingChapter.sections[sectionIndex].title = section.title;
        if (section.sequence) existingChapter.sections[sectionIndex].sequence = section.sequence;
        if (section.introduction) existingChapter.sections[sectionIndex].introduction = section.introduction;
        if (section.objective !== undefined) existingChapter.sections[sectionIndex].objective = section.objective;
        if (section.quiz) existingChapter.sections[sectionIndex].quiz = section.quiz;

        // Process content if provided
        if (section.content && Array.isArray(section.content)) {
          await processSectionContent(section.content, existingChapter.sections[sectionIndex], chapterIndex, j, files);
        }
      } else {
        console.log(`Section with ID ${section._id} not found in existing sections`);
      }
    } else {
      // This is a new section
      if (!section.title || !section.sequence || !section.introduction) {
        throw new Error(`New section in Chapter ${chapterIndex + 1} is missing required fields (title: ${!!section.title}, sequence: ${!!section.sequence}, introduction: ${!!section.introduction})`);
      }

      console.log(`Adding new section ${j} to chapter ${chapterIndex}`);

      const newSection = {
        title: section.title,
        sequence: section.sequence,
        introduction: section.introduction,
        objective: section.objective || '',
        quiz: section.quiz || null,
        content: []
      };

      // Process content for new section
      if (section.content && Array.isArray(section.content)) {
        newSection.content = await processNewSectionContent(section.content, chapterIndex, j, files);
      }

      existingChapter.sections.push(newSection);
    }
  }
}

// Helper function to process sections for new chapters
async function processNewChapterSections(sections, chapterIndex, files) {
  const processedSections = [];

  console.log(`Processing ${sections.length} sections for new chapter ${chapterIndex}`);

  for (let j = 0; j < sections.length; j++) {
    const section = sections[j];

    if (!section || !section.title || !section.sequence || !section.introduction) {
      throw new Error(`Section ${j + 1} in new Chapter ${chapterIndex + 1} is missing required fields (title: ${!!section?.title}, sequence: ${!!section?.sequence}, introduction: ${!!section?.introduction})`);
    }

    const newSection = {
      title: section.title,
      sequence: section.sequence,
      introduction: section.introduction,
      objective: section.objective || '',
      quiz: section.quiz || null,
      content: []
    };

    // Process content
    if (section.content && Array.isArray(section.content)) {
      newSection.content = await processNewSectionContent(section.content, chapterIndex, j, files);
    }

    processedSections.push(newSection);
  }

  return processedSections;
}


async function processSectionContent(contentArray, existingSection, chapterIndex, sectionIndex, files) {
  console.log(`Processing ${contentArray.length} content items for section ${sectionIndex} in chapter ${chapterIndex}`);

  for (let k = 0; k < contentArray.length; k++) {
    const content = contentArray[k];

    if (!content || (typeof content === 'object' && Object.keys(content).length === 0)) {
      console.log(`Content ${k} is empty/undefined, skipping...`);
      continue;
    }

    console.log(`Processing content ${k}:`, {
      hasId: !!content._id,
      title: content.title,
      contentType: content.contentType
    });

    // If content has an ID, it's an update to existing content
    if (content._id && mongoose.Types.ObjectId.isValid(content._id)) {
      const contentIndex = existingSection.content.findIndex(
        c => c._id && c._id.toString() === content._id.toString()
      );

      if (contentIndex !== -1) {
        console.log(`Updating existing content at index ${contentIndex}`);

        // Update existing content
        if (content.title) existingSection.content[contentIndex].title = content.title;
        if (content.description !== undefined) existingSection.content[contentIndex].description = content.description;
        // if (content.courseDuration) existingSection.content[contentIndex].courseDuration = content.courseDuration;
        if (content.sequence) existingSection.content[contentIndex].sequence = content.sequence;
        if (content.contentType) existingSection.content[contentIndex].contentType = content.contentType;
        if (content.textContent !== undefined) existingSection.content[contentIndex].textContent = content.textContent;
        if (content.duration) existingSection.content[contentIndex].duration = content.duration;
        if (content.minimumWatchTime) existingSection.content[contentIndex].minimumWatchTime = content.minimumWatchTime;

        // Handle video file updates
        if (content.contentType === 'video' && files && files.length > 0) {
          const videoFieldName = `chapter_video_${chapterIndex}_section_${sectionIndex}_content_${k}`;
          const thumbnailFieldName = `content_thumbnail_${chapterIndex}_section_${sectionIndex}_content_${k}`;

          const videoFile = files.find(file =>
            file.fieldname === videoFieldName ||
            file.fieldname === `${videoFieldName} `
          );

          if (videoFile) {
            existingSection.content[contentIndex].videoUrl = videoFile.path.replace(/\\/g, '/');
            console.log(`Updated video file for content ${contentIndex}`);
          }

          const thumbnailFile = files.find(file =>
            file.fieldname === thumbnailFieldName ||
            file.fieldname === `${thumbnailFieldName} `
          );

          if (thumbnailFile) {
            existingSection.content[contentIndex].thumbnail = thumbnailFile.path.replace(/\\/g, '/');
            console.log(`Updated thumbnail file for content ${contentIndex}`);
          }
        }
      } else {
        console.log(`Content with ID ${content._id} not found in existing content`);
      }
    } else {
      // This is new content
      if (!content.title || !content.contentType || !content.sequence) {
        throw new Error(`New content item in Section ${sectionIndex + 1}, Chapter ${chapterIndex + 1} is missing required fields (title: ${!!content.title}, contentType: ${!!content.contentType}, sequence: ${!!content.sequence})`);
      }

      console.log(`Adding new content ${k} to section ${sectionIndex}`);

      const newContent = {
        title: content.title,
        // courseDuration: content.courseDuration || 0,
        description: content.description || '',
        sequence: content.sequence,
        contentType: content.contentType,
        textContent: content.textContent || '',
        duration: content.duration || 0,
        minimumWatchTime: content.minimumWatchTime || 0,
        likes: 0,
        dislikes: 0,
        likedBy: [],
        dislikedBy: []
      };

      // Handle video content
      if (content.contentType === 'video') {
        const videoFieldName = `chapter_video_${chapterIndex}_section_${sectionIndex}_content_${k}`;
        const thumbnailFieldName = `content_thumbnail_${chapterIndex}_section_${sectionIndex}_content_${k}`;

        if (files && files.length > 0) {
          const videoFile = files.find(file =>
            file.fieldname === videoFieldName ||
            file.fieldname === `${videoFieldName} `
          );

          if (videoFile) {
            newContent.videoUrl = videoFile.path.replace(/\\/g, '/');
            console.log(`Added video file for new content ${k}`);
          } else {
            throw new Error(`Video file missing for new content item in Section ${sectionIndex + 1}, Chapter ${chapterIndex + 1}. Expected field: ${videoFieldName}`);
          }

          const thumbnailFile = files.find(file =>
            file.fieldname === thumbnailFieldName ||
            file.fieldname === `${thumbnailFieldName} `
          );

          if (thumbnailFile) {
            newContent.thumbnail = thumbnailFile.path.replace(/\\/g, '/');
            console.log(`Added thumbnail file for new content ${k}`);
          }
        } else {
          throw new Error(`Video file missing for new content item in Section ${sectionIndex + 1}, Chapter ${chapterIndex + 1}`);
        }
      }

      existingSection.content.push(newContent);
    }
  }
}

// Helper function to process content for new sections
async function processNewSectionContent(contentArray, chapterIndex, sectionIndex, files) {
  const processedContent = [];

  console.log(`Processing ${contentArray.length} content items for new section ${sectionIndex} in chapter ${chapterIndex}`);

  for (let k = 0; k < contentArray.length; k++) {
    const content = contentArray[k];

    if (!content || !content.title || !content.contentType || !content.sequence) {
      throw new Error(`Content item ${k + 1} in Section ${sectionIndex + 1}, Chapter ${chapterIndex + 1} is missing required fields (title: ${!!content?.title}, contentType: ${!!content?.contentType}, sequence: ${!!content?.sequence})`);
    }

    const newContent = {
      title: content.title,
      description: content.description || '',
      sequence: content.sequence,
      contentType: content.contentType,
      textContent: content.textContent || '',
      duration: content.duration || 0,
      minimumWatchTime: content.minimumWatchTime || 0,
      likes: 0,
      dislikes: 0,
      likedBy: [],
      dislikedBy: []
    };

    // Handle video content
    if (content.contentType === 'video') {
      const videoFieldName = `chapter_video_${chapterIndex}_section_${sectionIndex}_content_${k}`;
      const thumbnailFieldName = `content_thumbnail_${chapterIndex}_section_${sectionIndex}_content_${k}`;

      if (files && files.length > 0) {
        const videoFile = files.find(file =>
          file.fieldname === videoFieldName ||
          file.fieldname === `${videoFieldName} `
        );

        if (videoFile) {
          newContent.videoUrl = videoFile.path.replace(/\\/g, '/');
        } else {
          throw new Error(`Video file missing for content item ${k + 1} in Section ${sectionIndex + 1}, Chapter ${chapterIndex + 1}. Expected field: ${videoFieldName}`);
        }

        const thumbnailFile = files.find(file =>
          file.fieldname === thumbnailFieldName ||
          file.fieldname === `${thumbnailFieldName} `
        );

        if (thumbnailFile) {
          newContent.thumbnail = thumbnailFile.path.replace(/\\/g, '/');
        }
      } else {
        throw new Error(`Video file missing for content item ${k + 1} in Section ${sectionIndex + 1}, Chapter ${chapterIndex + 1}`);
      }
    }

    processedContent.push(newContent);
  }

  return processedContent;
}

// Helper function to count total videos
function countTotalVideos(chapters) {
  let totalVideos = 0;

  if (!chapters || !Array.isArray(chapters)) {
    return totalVideos;
  }

  chapters.forEach(chapter => {
    if (chapter.sections && Array.isArray(chapter.sections)) {
      chapter.sections.forEach(section => {
        if (section.content && Array.isArray(section.content)) {
          section.content.forEach(content => {
            if (content.contentType === 'video' && content.videoUrl) {
              totalVideos++;
            }
          });
        }
      });
    }
  });

  return totalVideos;
}












// const deleteCourse = async (req, res) => {
//     try {
//         const course = await Course.findById(req.params.id);

//         if (!course) {
//             return res.status(404).json({ message: 'Course not found' });
//         }

//         // Check if there are enrolled users
//         if (course.enrolledUsers.length > 0) {
//             course.isActive = false;
//             await course.save();
//             return res.status(200).json({ 
//                 message: 'Course has enrolled users. Marked as inactive instead of deleting.' 
//             });
//         }

//         // Delete associated files
//         const fs = require('fs').promises;

//         // Delete course thumbnail
//         if (course.thumbnail) {
//             await fs.unlink(path.join(__dirname, '..', course.thumbnail));
//         }

//         // Delete video files and thumbnails
//         for (const video of course.videos) {
//             if (video.videoUrl) {
//                 await fs.unlink(path.join(__dirname, '..', video.videoUrl));
//             }
//             if (video.thumbnail) {
//                 await fs.unlink(path.join(__dirname, '..', video.thumbnail));
//             }
//         }

//         await Course.findByIdAndDelete(req.params.id);

//         res.status(200).json({ message: 'Course deleted successfully' });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


// recent watch:



const bulkDeleteCourses = async (req, res) => {
  try {
    const { courseIds } = req.body;

    // Validate input
    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        message: 'Please provide an array of course IDs to delete'
      });
    }

    // Find all courses to be deleted
    const courses = await Course.find({ _id: { $in: courseIds } });

    if (courses.length === 0) {
      return res.status(404).json({ message: 'No courses found with provided IDs' });
    }

    const fs = require('fs').promises;
    const path = require('path');

    let deletedCount = 0;
    let deactivatedCount = 0;
    let errors = [];

    for (const course of courses) {
      try {
        // Check if there are enrolled users
        if (course.enrolledUsers.length > 0) {
        // Mark as inactive instead of deleting
            await Course.updateOne(
              { _id: course._id },
              { $set: { isActive: false } }
            );
            deactivatedCount++;
          }  else {
          // Delete associated files
          try {
            // Delete course thumbnail
            if (course.thumbnail) {
              await fs.unlink(path.join(__dirname, '..', course.thumbnail));
            }

            // Delete files from chapters/sections/content
            for (const chapter of course.chapters || []) {
              for (const section of chapter.sections || []) {
                for (const content of section.content || []) {
                  if (content.contentType === 'video') {
                    if (content.videoUrl) {
                      await fs.unlink(path.join(__dirname, '..', content.videoUrl));
                    }
                    if (content.thumbnail) {
                      await fs.unlink(path.join(__dirname, '..', content.thumbnail));
                    }
                  }
                }
              }
            }
          } catch (fileError) {
            // Log file deletion errors but continue with database deletion
            console.warn(`File deletion error for course ${course._id}:`, fileError.message);
          }

          // Delete the course from database
          await Course.findByIdAndDelete(course._id);
          deletedCount++;
        }
      } catch (courseError) {
        errors.push({
          courseId: course._id,
          courseName: course.name,
          error: courseError.message
        });
      }
    }

    // Prepare response
    let message = '';
    if (deletedCount > 0) {
      message += `${deletedCount} course(s) deleted successfully. `;
    }
    if (deactivatedCount > 0) {
      message += `${deactivatedCount} course(s) with enrolled users marked as inactive. `;
    }
    if (errors.length > 0) {
      message += `${errors.length} course(s) failed to process.`;
    }

    res.status(200).json({
      message: message.trim(),
      summary: {
        totalRequested: courseIds.length,
        deleted: deletedCount,
        deactivated: deactivatedCount,
        failed: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    res.status(500).json({
      message: 'Bulk delete operation failed',
      error: error.message
    });
  }
};




const getRecentWatches = async (req, res) => {
  try {
    const userId = req.user._id;

    const courses = await Course.find({
      'enrolledUsers.user': userId
    })
      .select('name thumbnail videos enrolledUsers approximateHours totalVideos')
      .sort({ 'enrolledUsers.lastWatchedAt': -1 })
      .limit(5);

    const recentCourses = courses.map(course => {
      const userEnrollment = course.enrolledUsers.find(
        e => e.user.toString() === userId.toString()
      );

      return {
        courseId: course._id,
        name: course.name,
        thumbnail: course.thumbnail,
        totalVideos: course.totalVideos,
        approximateHours: course.approximateHours,
        lastWatchedVideo: course.videos[userEnrollment.currentVideo],
        progress: userEnrollment.progress,
        lastWatchedAt: userEnrollment.completedVideos[userEnrollment.completedVideos.length - 1]?.lastWatchedAt
      };
    });

    res.status(200).json(recentCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// get video with progress validation:
// const getVideoWithProgress = async (req, res) => {
//     try {
//         const { courseId, videoId } = req.params;
//         const userId = req.user._id;

//         const course = await Course.findById(courseId);
//         if (!course) {
//             return res.status(404).json({ message: 'Course not found' });
//         }

//         const userEnrollment = course.enrolledUsers.find(
//             e => e.user.toString() === userId.toString()
//         );

//         const requestedVideoIndex = course.videos.findIndex(
//             v => v._id.toString() === videoId
//         );

//         // Check if previous video is completed
//         if (requestedVideoIndex > 0) {
//             const previousVideo = course.videos[requestedVideoIndex - 1];
//             const previousVideoProgress = userEnrollment.completedVideos.find(
//                 v => v.videoId.toString() === previousVideo._id.toString()
//             );

//             if (!previousVideoProgress?.completed) {
//                 return res.status(403).json({
//                     message: 'Please complete the previous video first',
//                     requiredWatchTime: previousVideo.minimumWatchTime
//                 });
//             }
//         }

//         // Get current video progress
//         const currentVideoProgress = userEnrollment.completedVideos.find(
//             v => v.videoId.toString() === videoId
//         );

//         const video = course.videos[requestedVideoIndex];

//         res.status(200).json({
//             video: {
//                 _id: video._id,
//                 title: video.title,
//                 videoUrl: video.videoUrl,
//                 duration: video.duration,
//                 minimumWatchTime: video.minimumWatchTime,
//                 thumbnail: video.thumbnail
//             },
//             progress: {
//                 watchedDuration: currentVideoProgress?.watchedDuration || 0,
//                 completed: currentVideoProgress?.completed || false,
//                 canProceedNext: currentVideoProgress?.completed || false
//             },
//             totalVideos: course.videos.length,
//             currentVideoNumber: requestedVideoIndex + 1
//         });

//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

const getVideoWithProgress = async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    const userId = req.user._id;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    let userEnrollment = course.enrolledUsers.find(
      e => e.user.toString() === userId.toString()
    );

    if (!userEnrollment) {
      // return res.status(403).json({ message: 'User not enrolled in this course' });
      userEnrollment = {
        user: userId,
        enrollmentDate: new Date(),
        progress: 0,
        completedVideos: []
      };
      course.enrolledUsers.push(userEnrollment);
      await course.save();
    }

    const requestedVideo = course.videos.find(
      v => v._id.toString() === videoId
    );

    if (!requestedVideo) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Check if previous videos are completed
    const previousVideos = course.videos.filter(v => v.order < requestedVideo.order);
    for (const prevVideo of previousVideos) {
      const prevVideoProgress = userEnrollment.completedVideos.find(
        v => v.videoId.toString() === prevVideo._id.toString()
      );

      if (!prevVideoProgress?.completed) {
        return res.status(403).json({
          message: 'Please complete the previous videos first',
          requiredWatchTime: prevVideo.minimumWatchTime
        });
      }
    }

    // Get current video progress
    const currentVideoProgress = userEnrollment.completedVideos.find(
      v => v.videoId.toString() === videoId
    );

    res.status(200).json({
      video: {
        _id: requestedVideo._id,
        title: requestedVideo.title,
        videoUrl: requestedVideo.videoUrl,
        duration: requestedVideo.duration,
        minimumWatchTime: requestedVideo.minimumWatchTime,
        thumbnail: requestedVideo.thumbnail,
        order: requestedVideo.order
      },
      progress: {
        watchedDuration: currentVideoProgress?.watchedDuration || 0,
        completed: currentVideoProgress?.completed || false,
        canProceedNext: currentVideoProgress?.completed || false
      },
      totalVideos: course.videos.length,
      currentVideoNumber: requestedVideo.order
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// Update video watch progress
const updateWatchProgress = async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    const { watchedDuration } = req.body;
    const userId = req.user._id;

    const course = await Course.findById(courseId);
    const userEnrollment = course.enrolledUsers.find(
      e => e.user.toString() === userId.toString()
    );

    const videoIndex = course.videos.findIndex(
      v => v._id.toString() === videoId
    );
    const video = course.videos[videoIndex];

    // Update video progress
    const videoProgressIndex = userEnrollment.completedVideos.findIndex(
      v => v.videoId.toString() === videoId
    );

    const isCompleted = watchedDuration >= video.minimumWatchTime;

    const progressUpdate = {
      videoId: video._id,
      watchedDuration,
      completed: isCompleted,
      lastWatchedAt: new Date()
    };

    if (videoProgressIndex > -1) {
      userEnrollment.completedVideos[videoProgressIndex] = progressUpdate;
    } else {
      userEnrollment.completedVideos.push(progressUpdate);
    }

    userEnrollment.currentVideo = videoIndex;

    // Update overall progress
    const totalVideos = course.videos.length;
    const completedVideos = userEnrollment.completedVideos.filter(v => v.completed).length;
    userEnrollment.progress = Math.round((completedVideos / totalVideos) * 100);

    await course.save();

    res.status(200).json({
      completed: isCompleted,
      progress: userEnrollment.progress,
      canProceedNext: isCompleted,
      nextVideoId: isCompleted && videoIndex < course.videos.length - 1 ?
        course.videos[videoIndex + 1]._id : null
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const getAvailableCoursesForUser = async (req, res) => {
  try {
    // Check if user object exists and has necessary properties
    // if (!req.user) {
    //   return res.status(401).json({
    //     success: false,
    //     message: 'User not authenticated'
    //   });
    // }

    // Use optional chaining to safely access properties
    const userId = req.user.id || req.user._id;
    const userRoleId = req.user.role;
    const userWarehouseId = req.user.warehouse;

    // Validate required user information
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in authentication token'
      });
    }

    console.log("Getting available courses for user:", userId);
    console.log("User role:", userRoleId);
    console.log("User warehouse:", userWarehouseId);

    // Find all courses assigned to the user's role or warehouse
    const query = { isActive: true };

    // Only add role/warehouse filters if they exist
    if (userRoleId || userWarehouseId) {
      const orConditions = [];

      if (userRoleId) {
        orConditions.push({ 'accessControl.roles': userRoleId });
      }

      if (userWarehouseId) {
        orConditions.push({ 'accessControl.stores': userWarehouseId });
      }

      if (orConditions.length > 0) {
        query.$or = orConditions;
      }
    }

    const allCourses = await Course.find(query)
      .select('name description thumbnail level courseType language approximateHours totalVideos status sequence passingGrade weightage');

    console.log(`Found ${allCourses.length} courses available for user`);

    // Separate main courses and short courses
    const mainCourses = allCourses.filter(course => course.courseType === 'Course')
      .sort((a, b) => a.sequence - b.sequence); // Sort by sequence

    const shortCourses = allCourses.filter(course => course.courseType === 'Short Course')
      .sort((a, b) => a.sequence - b.sequence); // Sort by sequence

    // Get user's enrollments
    const userEnrollments = await Course.find({
      'enrolledUsers.user': userId
    }).select('_id enrolledUsers');

    console.log(`Found ${userEnrollments.length} courses where user is enrolled`);

    // Create a map of course IDs to enrollment status
    const enrollmentMap = {};
    userEnrollments.forEach(course => {
      const enrollment = course.enrolledUsers.find(e =>
        e.user && e.user.toString() === userId.toString()
      );

      if (enrollment) {
        enrollmentMap[course._id.toString()] = {
          progress: enrollment.progress || 0,
          gradePercentage: enrollment.gradePercentage || 0,
          gradeLabel: enrollment.gradeLabel || 'Incomplete',
          passed: (enrollment.gradePercentage || 0) >= (course.passingGrade || 70)
        };
      }
    });

    // Process main courses to determine unlock status
    const processedMainCourses = mainCourses.map((course, index) => {
      const courseObj = course.toObject();

      // Check if user is enrolled
      const isEnrolled = enrollmentMap.hasOwnProperty(course._id.toString());
      courseObj.isEnrolled = isEnrolled;

      // Determine unlock status
      let unlockStatus = 'Locked';

      // First course is always unlocked
      if (index === 0) {
        unlockStatus = 'Unlocked';
      }
      // For subsequent courses, check if previous course is completed with passing grade
      else if (index > 0) {
        const previousCourse = mainCourses[index - 1];
        const previousCourseEnrollment = enrollmentMap[previousCourse._id.toString()];

        if (previousCourseEnrollment &&
          previousCourseEnrollment.progress === 100 &&
          previousCourseEnrollment.passed) {
          unlockStatus = 'Unlocked';
        }
      }

      // If enrolled, set status based on progress
      if (isEnrolled) {
        const enrollment = enrollmentMap[course._id.toString()];

        if (enrollment.progress === 0) {
          courseObj.status = 'Not Started';
        } else if (enrollment.progress === 100) {
          if (enrollment.passed) {
            courseObj.status = 'Completed';
            unlockStatus = 'Completed';
          } else {
            courseObj.status = 'Failed';
          }
        } else {
          courseObj.status = 'In Progress';
        }

        courseObj.progress = enrollment.progress;
        courseObj.gradePercentage = enrollment.gradePercentage;
        courseObj.gradeLabel = enrollment.gradeLabel;
      } else {
        courseObj.status = 'Not Started';
        courseObj.progress = 0;
        courseObj.gradePercentage = 0;
        courseObj.gradeLabel = 'Incomplete';
      }

      courseObj.unlockStatus = unlockStatus;
      courseObj.weightage = course.weightage || 100;

      return courseObj;
    });

    // Process short courses with lock/unlock logic
    // Short courses unlock ONLY if:
    // 1. All main courses are completed
    // 2. Program percentage < 70 (needs remediation)
    // 3. Short course is not already completed/passed (>= 70%)

    const processedShortCourses = shortCourses.map(course => {
      const courseObj = course.toObject();

      // Check if user is enrolled
      const isEnrolled = enrollmentMap.hasOwnProperty(course._id.toString());
      courseObj.isEnrolled = isEnrolled;
      
      // Default: Short course is locked
      let unlockStatus = 'Locked';
      let lockReason = 'Complete all main courses first';
      
      // Check if all main courses are completed
      const allMainCoursesCompleted = mainCourses.length > 0 && mainCourses.every((c) => {
        const enrollment = enrollmentMap[c._id.toString()];
        return enrollment && (
          enrollment.progress === 100 ||
          enrollment.status === 'Completed' ||
          enrollment.status === 'Done'
        );
      });
      
      if (allMainCoursesCompleted) {
        // Calculate program percentage from main courses
        const programPercentage = mainCourses.length > 0
          ? Math.round(mainCourses.reduce((sum, c) => {
              const enrollment = enrollmentMap[c._id.toString()];
              return sum + (enrollment?.gradePercentage || 0);
            }, 0) / mainCourses.length)
          : 0;
        
        const passingThreshold = 70;
        
        if (programPercentage < passingThreshold) {
          // Check if short course is already completed or passed
          const enrollment = enrollmentMap[course._id.toString()];
          const isShortCourseCompleted = enrollment && (
            enrollment.progress === 100 ||
            enrollment.status === 'Completed' ||
            enrollment.status === 'Done'
          );
          const isShortCoursePassed = enrollment && enrollment.gradePercentage >= passingThreshold;
          
          if (!isShortCourseCompleted && !isShortCoursePassed) {
            // Short course is unlocked for remediation
            unlockStatus = 'Unlocked';
            lockReason = null;
          } else if (isShortCourseCompleted || isShortCoursePassed) {
            // Short course is completed/passed, so it's accessible
            unlockStatus = 'Unlocked';
            lockReason = 'Already completed';
          }
        } else {
          // Program percentage >= 70, short courses not needed
          unlockStatus = 'Locked';
          lockReason = 'Program percentage is 70% or above. Short courses not required.';
        }
      } else {
        // Not all main courses completed yet
        unlockStatus = 'Locked';
        lockReason = 'Complete all main courses first';
      }
      
      courseObj.unlockStatus = unlockStatus;
      courseObj.lockReason = lockReason;

      // If enrolled, set status based on progress
      if (isEnrolled) {
        const enrollment = enrollmentMap[course._id.toString()];

        if (enrollment.progress === 0) {
          courseObj.status = 'Not Started';
        } else if (enrollment.progress === 100) {
          if (enrollment.passed) {
            courseObj.status = 'Completed';
          } else {
            courseObj.status = 'Failed';
          }
        } else {
          courseObj.status = 'In Progress';
        }

        courseObj.progress = enrollment.progress;
        courseObj.gradePercentage = enrollment.gradePercentage;
        courseObj.gradeLabel = enrollment.gradeLabel;
      } else {
        courseObj.status = 'Not Started';
        courseObj.progress = 0;
        courseObj.gradePercentage = 0;
        courseObj.gradeLabel = 'Incomplete';
      }

      courseObj.weightage = course.weightage || 100;

      return courseObj;
    });

    console.log("Successfully processed courses");

    res.status(200).json({
      success: true,
      data: {
        mainCourses: processedMainCourses,
        shortCourses: processedShortCourses
      }
    });
  } catch (error) {
    console.error('Error getting available courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting available courses',
      error: error.message
    });
  }
};




// admin sites progress:
const getAllUsersProgress = async (req, res) => {
  try {
    console.log("Admin getting all users progress...");

    const {
      page = 1,
      limit = 10,
      courseId,
      status,
      search,
      sortBy = 'enrollmentDate',
      sortOrder = 'desc'
    } = req.query;

    // Build course query
    let courseQuery = { isActive: true };
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      courseQuery._id = new mongoose.Types.ObjectId(courseId);
    }

    // 🆕 GET COURSES WITH ENROLLED USERS (SAME AS SINGLE USER LOGIC)
    const courses = await Course.find(courseQuery)
      .populate({
        path: 'enrolledUsers.user',
        model: 'Customer',
        select: 'username email firstName lastName profilePicture isActive createdAt lastLogin department',
        populate: [
          { path: 'role', select: 'name' },
          { path: 'warehouse', select: 'name location' },
          { path: 'department', select: 'name' },

        ]
      })
      .populate({
        path: 'enrolledUsers.certificateRequestId',
        model: 'CertificateRequest',
        select: 'status certificateId createdAt reviewedAt certificateImagePath'
      })
      .select('name description thumbnail level courseType language approximateHours totalVideos status passingGrade chapters enrolledUsers weightage');

    console.log(`Found ${courses.length} courses`);

    // 🆕 GET ALL QUIZ RESULTS (SAME AS SINGLE USER)
    const allQuizResults = await Quiz.find({});

    // 🆕 CREATE USER MAP TO ORGANIZE DATA
    const userMap = new Map();

    // 🆕 PROCESS EACH COURSE AND ENROLLMENT (EXACT SAME LOGIC AS SINGLE USER)
    for (const course of courses) {
      if (!course.enrolledUsers || course.enrolledUsers.length === 0) continue;

      for (const enrollment of course.enrolledUsers) {
        if (!enrollment.user) continue;

        const userId = enrollment.user._id.toString();
        const user = enrollment.user;

        // Apply search filter
        if (search) {
          const searchLower = search.toLowerCase();
          const matchesSearch =
            user.username?.toLowerCase().includes(searchLower) ||
            user.email?.toLowerCase().includes(searchLower) ||
            user.firstName?.toLowerCase().includes(searchLower) ||
            user.lastName?.toLowerCase().includes(searchLower);

          if (!matchesSearch) continue;
        }

        // Initialize user in map if not exists
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            _id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            role: user.role ? {
              _id: user.role._id,
              name: user.role.name
            } : null,
            warehouse: user.warehouse ? {
              _id: user.warehouse._id,
              name: user.warehouse.name,
              location: user.warehouse.location
            } : null,
            department: user.department ? {
              _id: user.department._id,
              name: user.department.name,
              code: user.department.code
            } : null,
            profilePicture: user.profilePicture,
            isActive: user.isActive,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            courses: [],
            courseSummary: {
              totalEnrolled: 0,
              mainCoursesCount: 0,
              shortCoursesCount: 0,
              completedCourses: 0,
              inProgressCourses: 0,
              failedCourses: 0,
              certificatesEarned: 0,
              averageProgress: 0,
              certificateEligible: 0,
              certificateRequested: 0,
              certificateApproved: 0
            }
          });
        }

        const userData = userMap.get(userId);

        // 🆕 CALCULATE COURSE PROGRESS (EXACT SAME AS SINGLE USER LOGIC)
        const courseProgress = await calculateSingleCourseProgress(course, enrollment, userId, allQuizResults);

        // Apply status filter
        if (status && courseProgress.status !== status) continue;

        // Add course to user's courses
        userData.courses.push(courseProgress);

        // 🆕 UPDATE USER SUMMARY (SAME LOGIC AS SINGLE USER)
        userData.courseSummary.totalEnrolled++;

        if (courseProgress.courseType === 'Course') {
          userData.courseSummary.mainCoursesCount++;
        } else if (courseProgress.courseType === 'Short Course') {
          userData.courseSummary.shortCoursesCount++;
        }

        // Status counting (same as single user)
        if (courseProgress.status === 'Completed') {
          userData.courseSummary.completedCourses++;
        } else if (courseProgress.status === 'Done') {
          userData.courseSummary.completedCourses++;
          userData.courseSummary.certificatesEarned++;
        } else if (courseProgress.status === 'In Progress') {
          userData.courseSummary.inProgressCourses++;
        } else if (courseProgress.status === 'Failed') {
          userData.courseSummary.failedCourses++;
        }

        // Certificate status counting
        if (courseProgress.certificateInfo.requestStatus === 'Eligible') {
          userData.courseSummary.certificateEligible++;
        } else if (courseProgress.certificateInfo.requestStatus === 'Requested') {
          userData.courseSummary.certificateRequested++;
        } else if (courseProgress.certificateInfo.requestStatus === 'Approved') {
          userData.courseSummary.certificateApproved++;
        }
      }
    }

    // Convert map to array and calculate averages
    let processedUsers = Array.from(userMap.values()).map(user => {
      // Calculate average progress
      if (user.courses.length > 0) {
        const totalProgress = user.courses.reduce((sum, course) => sum + course.progress, 0);
        user.courseSummary.averageProgress = Math.round(totalProgress / user.courses.length);
      }

      // Separate main courses and short courses
      const mainCourses = user.courses.filter(course => course.courseType === 'Course');
      const shortCourses = user.courses.filter(course => course.courseType === 'Short Course');

      return {
        ...user,
        courses: {
          mainCourses,
          shortCourses
        }
      };
    });

    console.log(`Processed ${processedUsers.length} users with enrollments`);

    // Sort users (same logic)
    processedUsers.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'progress':
          aValue = a.courseSummary.averageProgress;
          bValue = b.courseSummary.averageProgress;
          break;
        case 'enrollmentDate':
          const aEarliestEnrollment = Math.min(...a.courses.mainCourses.concat(a.courses.shortCourses).map(c => new Date(c.enrollmentDate || 0)));
          const bEarliestEnrollment = Math.min(...b.courses.mainCourses.concat(b.courses.shortCourses).map(c => new Date(c.enrollmentDate || 0)));
          aValue = aEarliestEnrollment;
          bValue = bEarliestEnrollment;
          break;
        case 'username':
          aValue = a.username?.toLowerCase() || '';
          bValue = b.username?.toLowerCase() || '';
          break;
        default:
          aValue = a.courseSummary.averageProgress;
          bValue = b.courseSummary.averageProgress;
      }

      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Apply pagination
    const totalUsers = processedUsers.length;
    const skip = (page - 1) * limit;
    const paginatedUsers = processedUsers.slice(skip, skip + parseInt(limit));

    // Calculate overall statistics
    const overallStats = {
      totalUsers: totalUsers,
      activeUsers: processedUsers.filter(u => u.isActive).length,
      totalEnrollments: processedUsers.reduce((sum, u) => sum + u.courseSummary.totalEnrolled, 0),
      totalCompletedCourses: processedUsers.reduce((sum, u) => sum + u.courseSummary.completedCourses, 0),
      totalInProgressCourses: processedUsers.reduce((sum, u) => sum + u.courseSummary.inProgressCourses, 0),
      totalFailedCourses: processedUsers.reduce((sum, u) => sum + u.courseSummary.failedCourses, 0),
      totalCertificatesEarned: processedUsers.reduce((sum, u) => sum + u.courseSummary.certificatesEarned, 0),
      averageProgressAllUsers: processedUsers.length > 0 ?
        Math.round(processedUsers.reduce((sum, u) => sum + u.courseSummary.averageProgress, 0) / processedUsers.length) : 0
    };

    console.log(`Successfully retrieved progress for ${paginatedUsers.length} users`);

    res.status(200).json({
      success: true,
      message: 'All users progress retrieved successfully',
      data: {
        users: paginatedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers: totalUsers,
          hasNextPage: page * limit < totalUsers,
          hasPrevPage: page > 1
        },
        overallStats,
        filters: {
          courseId: courseId || null,
          status: status || null,
          search: search || null,
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Error getting all users progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get all users progress',
      error: error.message
    });
  }
};





// 🆕 SINGLE COURSE PROGRESS CALCULATION (EXACT SAME AS getUserCourseProgress)
const calculateSingleCourseProgress = async (course, enrollment, userId, allQuizResults) => {
  console.log(`Processing course: ${course.name} for user: ${userId}`);

  // Get quiz results for this course and user
  const courseQuizResults = allQuizResults.filter(quiz =>
    quiz.courseId.toString() === course._id.toString()
  );

  // Initialize counters (SAME AS SINGLE USER LOGIC)
  let totalSections = 0;
  let completedSections = 0;
  let totalContent = 0;
  let completedContent = 0;
  let totalQuizzes = 0;
  let passedQuizzes = 0;
  let failedQuizzes = 0;
  let totalQuizScore = 0;
  let totalPossibleQuizScore = 0;
  let hasAnyQuizAttempt = false;
  let hasAnyFailedQuiz = false;
  let quizAttempts = [];

  // Check if chapters exists
  if (!course.chapters || !Array.isArray(course.chapters)) {
    console.log(`Course ${course._id} has no chapters array`);
    return createEmptyCourseProgress(course, enrollment);
  }

  // Process each chapter and section (EXACT SAME LOGIC AS SINGLE USER)
  for (const chapter of course.chapters) {
    if (!chapter.sections || !Array.isArray(chapter.sections)) {
      console.log(`Chapter ${chapter._id} has no sections array`);
      continue;
    }

    // Find chapter progress
    const chapterProgress = enrollment.chapterProgress?.find(
      cp => cp && cp.chapterId && cp.chapterId.toString() === chapter._id.toString()
    );

    for (const section of chapter.sections) {
      totalSections++;

      // Find section progress
      const sectionProgress = chapterProgress?.sectionProgress?.find(
        sp => sp && sp.sectionId && sp.sectionId.toString() === section._id.toString()
      );

      // Count content items and their completion (SAME LOGIC)
      if (section.content && Array.isArray(section.content)) {
        for (const content of section.content) {
          totalContent++;

          // Check if content is completed
          const contentProgress = sectionProgress?.contentProgress?.find(
            cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
          );

          if (contentProgress) {
            if (content.contentType === 'video') {
              if (contentProgress.watchedDuration >= content.minimumWatchTime) {
                completedContent++;
              }
            } else if (content.contentType === 'text') {
              if (contentProgress.completed) {
                completedContent++;
              }
            }
          }
        }
      }

      // Check quiz for this section (SAME LOGIC)
      if (section.quiz) {
        totalQuizzes++;

        // Find actual quiz result from Quiz collection
        const quizResult = courseQuizResults.find(quiz =>
          quiz.sectionId.toString() === section._id.toString()
        );

        if (quizResult) {
          // Get user's attempts for this quiz
          const userAttempts = quizResult.attempts.filter(
            attempt => attempt.userId.toString() === userId
          );

          if (userAttempts.length > 0) {
            hasAnyQuizAttempt = true;

            // Get best attempt
            const bestAttempt = userAttempts.reduce((best, current) =>
              current.percentage > best.percentage ? current : best
            );

            // Add quiz attempt details
            quizAttempts.push({
              quizId: quizResult._id,
              quizTitle: quizResult.title,
              sectionTitle: section.title,
              chapterTitle: chapter.title,
              totalAttempts: userAttempts.length,
              maxAttempts: quizResult.maxAttempts,
              bestScore: bestAttempt.percentage,
              bestGrade: bestAttempt.grade,
              passed: bestAttempt.passed,
              lastAttemptDate: bestAttempt.attemptDate,
              timeLimit: quizResult.timeLimit,
              passingScore: quizResult.passingScore
            });

            totalPossibleQuizScore += 100;
            totalQuizScore += bestAttempt.percentage;

            if (bestAttempt.passed && bestAttempt.percentage >= 70) {
              passedQuizzes++;
            } else {
              failedQuizzes++;
              hasAnyFailedQuiz = true;
            }
          }
        }
      }

      // Check if section is completed (SAME LOGIC AS SINGLE USER)
      let sectionCompleted = true;

      // Check all content completion
      if (section.content && Array.isArray(section.content)) {
        for (const content of section.content) {
          const contentProgress = sectionProgress?.contentProgress?.find(
            cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
          );

          if (!contentProgress) {
            sectionCompleted = false;
            break;
          }

          if (content.contentType === 'video') {
            if (contentProgress.watchedDuration < content.minimumWatchTime) {
              sectionCompleted = false;
              break;
            }
          } else if (content.contentType === 'text') {
            if (!contentProgress.completed) {
              sectionCompleted = false;
              break;
            }
          }
        }
      }

      // Check quiz completion if exists
      if (section.quiz && sectionCompleted) {
        const quizResult = courseQuizResults.find(quiz =>
          quiz.sectionId.toString() === section._id.toString()
        );

        if (quizResult) {
          const userAttempts = quizResult.attempts.filter(
            attempt => attempt.userId.toString() === userId
          );

          if (userAttempts.length > 0) {
            const bestAttempt = userAttempts.reduce((best, current) =>
              current.percentage > best.percentage ? current : best
            );

            if (!bestAttempt.passed || bestAttempt.percentage < 70) {
              sectionCompleted = false;
            }
          } else {
            sectionCompleted = false;
          }
        } else {
          sectionCompleted = false;
        }
      }

      if (sectionCompleted) {
        completedSections++;
      }
    }
  }

  // Calculate overall progress (SAME LOGIC)
  const contentProgress = totalContent > 0 ? (completedContent / totalContent) * 100 : 0;
  const quizProgress = totalQuizzes > 0 ? (passedQuizzes / totalQuizzes) * 100 : 100;
  const overallProgress = Math.round((contentProgress + quizProgress) / 2);

  // Calculate grade (SAME LOGIC)
  let gradePercentage = 0;
  let gradeLabel = 'Incomplete';

  if (totalQuizzes > 0 && hasAnyQuizAttempt) {
    gradePercentage = Math.round(totalQuizScore / totalPossibleQuizScore * 100);

    if (gradePercentage >= 90) gradeLabel = 'A';
    else if (gradePercentage >= 80) gradeLabel = 'B';
    else if (gradePercentage >= 70) gradeLabel = 'C';
    else if (gradePercentage >= 60) gradeLabel = 'D';
    else gradeLabel = 'F';
  } else if (overallProgress === 100 && totalQuizzes === 0) {
    gradePercentage = 100;
    gradeLabel = 'A';
  }

  // 🆕 DETERMINE STATUS (EXACT SAME LOGIC AS SINGLE USER)
  let status = 'Not Started';
  let certificateStatus = 'Not Eligible';

  // Check enrollment status first
  if (enrollment.status) {
    status = enrollment.status;
  } else {
    // Calculate status based on progress if not set
    if (overallProgress === 0 && !hasAnyQuizAttempt) {
      status = 'Not Started';
    } else if (hasAnyFailedQuiz && overallProgress < 100) {
      status = 'Failed';
      gradeLabel = 'F';
    } else if (overallProgress === 100 && failedQuizzes === 0 && totalQuizzes > 0 && passedQuizzes === totalQuizzes) {
      if (gradePercentage >= course.passingGrade) {
        status = 'Completed';
      } else {
        status = 'Failed';
      }
    } else if (overallProgress > 0 || hasAnyQuizAttempt) {
      status = 'In Progress';
    }
  }

  // 🆕 CERTIFICATE STATUS LOGIC (SAME AS SINGLE USER)
  if (status === 'Completed') {
    certificateStatus = 'Eligible';

    // Check certificate request status
    if (enrollment.certificateRequestStatus === 'Requested') {
      certificateStatus = 'Requested';
    } else if (enrollment.certificateRequestStatus === 'Approved') {
      status = 'Done';
      certificateStatus = 'Approved';
    } else if (enrollment.certificateRequestStatus === 'Rejected') {
      certificateStatus = 'Eligible';
    }
  } else if (status === 'Done') {
    certificateStatus = 'Approved';
  } else if (status === 'Failed') {
    certificateStatus = 'Not Eligible';
  } else {
    certificateStatus = 'Not Eligible';
  }

  // 🆕 CERTIFICATE INFORMATION (SAME LOGIC)
  let certificateInfo = {
    eligible: certificateStatus === 'Eligible',
    requestStatus: enrollment.certificateRequestStatus || 'Not Eligible',
    requestId: enrollment.certificateRequestId || null,
    certificateRequest: null,
    canRequest: certificateStatus === 'Eligible' && status === 'Completed'
  };

  // Get certificate request details if exists
  if (enrollment.certificateRequestId) {
    try {
      const CertificateRequest = require('../models/certificateRequest.model');
      const certificateRequest = await CertificateRequest.findById(enrollment.certificateRequestId)
        .select('status certificateId createdAt reviewedAt certificateImagePath userSignaturePath presidentSignaturePath');

      if (certificateRequest) {
        certificateInfo.certificateRequest = {
          id: certificateRequest._id,
          status: certificateRequest.status,
          certificateId: certificateRequest.certificateId,
          createdAt: certificateRequest.createdAt,
          reviewedAt: certificateRequest.reviewedAt,
          certificateImagePath: certificateRequest.certificateImagePath,
          userSignaturePath: certificateRequest.userSignaturePath,
          presidentSignaturePath: certificateRequest.presidentSignaturePath
        };

        // Update certificate status based on actual request status
        if (certificateRequest.status === 'Pending') {
          certificateInfo.requestStatus = 'Requested';
          certificateInfo.canRequest = false;
        } else if (certificateRequest.status === 'Approved' || certificateRequest.status === 'Certificate_Generated') {
          certificateInfo.requestStatus = 'Approved';
          certificateInfo.canRequest = false;
        } else if (certificateRequest.status === 'Rejected') {
          certificateInfo.requestStatus = 'Rejected';
          certificateInfo.eligible = true;
          certificateInfo.canRequest = true;
        }
      }
    } catch (certError) {
      console.error('Error fetching certificate request:', certError);
    }
  }

  // 🆕 RETURN SAME FORMAT AS SINGLE USER
  return {
    courseId: course._id,
    courseName: course.name,
    courseDescription: course.description,
    courseThumbnail: course.thumbnail,
    courseType: course.courseType,
    level: course.level,
    language: course.language,
    approximateHours: course.approximateHours,
    totalVideos: course.totalVideos,
    passingGrade: course.passingGrade,

    // Progress data
    progress: overallProgress,
    status: status,
    gradePercentage: gradePercentage,
    gradeLabel: gradeLabel,

    // Enrollment data
    enrollmentDate: enrollment.enrollmentDate,
    completionDate: enrollment.completionDate,
    lastAccessDate: enrollment.lastAccessDate || enrollment.enrollmentDate,

    // Certificate information
    certificateInfo: certificateInfo,

    // Detailed stats
    contentStats: {
      totalSections: totalSections,
      completedSections: completedSections,
      totalContent: totalContent,
      completedContent: completedContent,
      sectionProgress: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
      contentProgress: totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0
    },

    quizStats: {
      total: totalQuizzes,
      completed: passedQuizzes,
      failed: failedQuizzes,
      notAttempted: totalQuizzes - passedQuizzes - failedQuizzes,
      percentage: totalQuizzes > 0 ? Math.round((passedQuizzes / totalQuizzes) * 100) : 0,
      averageScore: totalQuizzes > 0 ? Math.round(totalQuizScore / totalQuizzes) : 0,
      attempts: quizAttempts
    },

    // Performance metrics
    performance: {
      efficiency: calculateEfficiency(overallProgress, enrollment.totalTimeSpent, course.approximateHours),
      riskLevel: calculateRiskLevel(overallProgress, gradePercentage, enrollment),
      needsAttention: checkNeedsAttention(overallProgress, gradePercentage, enrollment, hasAnyFailedQuiz)
    }
  };
};



const createEmptyCourseProgress = (course, enrollment) => {
  return {
    courseId: course._id,
    courseName: course.name,
    courseDescription: course.description,
    courseThumbnail: course.thumbnail,
    courseType: course.courseType,
    level: course.level,
    language: course.language,
    approximateHours: course.approximateHours,
    totalVideos: course.totalVideos,
    passingGrade: course.passingGrade,

    progress: 0,
    status: 'Not Started',
    gradePercentage: 0,
    gradeLabel: 'Incomplete',

    enrollmentDate: enrollment.enrollmentDate,
    completionDate: null,
    lastAccessDate: enrollment.enrollmentDate,

    certificateInfo: {
      eligible: false,
      requestStatus: 'Not Eligible',
      requestId: null,
      certificateRequest: null,
      canRequest: false
    },

    contentStats: {
      totalSections: 0,
      completedSections: 0,
      totalContent: 0,
      completedContent: 0,
      sectionProgress: 0,
      contentProgress: 0
    },

    quizStats: {
      total: 0,
      completed: 0,
      failed: 0,
      notAttempted: 0,
      percentage: 0,
      averageScore: 0,
      attempts: []
    },

    performance: {
      efficiency: 'Unknown',
      riskLevel: 'Low',
      needsAttention: false
    }
  };
};






// Helper function to calculate individual course progress
const calculateCourseProgress = async (course, enrollment, courseQuizResults, userId) => {
  try {
    // Initialize counters (same logic as getUserCourseProgress)
    let totalSections = 0;
    let completedSections = 0;
    let totalContent = 0;
    let completedContent = 0;
    let totalQuizzes = 0;
    let passedQuizzes = 0;
    let failedQuizzes = 0;
    let totalQuizScore = 0;
    let totalPossibleQuizScore = 0;
    let hasAnyQuizAttempt = false;
    let hasAnyFailedQuiz = false;
    let quizAttempts = [];

    // Check if chapters exists
    if (!course.chapters || !Array.isArray(course.chapters)) {
      return createEmptyCourseProgress(course, enrollment);
    }

    // Process each chapter and section
    for (const chapter of course.chapters) {
      if (!chapter.sections || !Array.isArray(chapter.sections)) continue;

      // Find chapter progress
      const chapterProgress = enrollment.chapterProgress?.find(
        cp => cp && cp.chapterId && cp.chapterId.toString() === chapter._id.toString()
      );

      for (const section of chapter.sections) {
        totalSections++;

        // Find section progress
        const sectionProgress = chapterProgress?.sectionProgress?.find(
          sp => sp && sp.sectionId && sp.sectionId.toString() === section._id.toString()
        );

        // Count content items and their completion
        if (section.content && Array.isArray(section.content)) {
          for (const content of section.content) {
            totalContent++;

            // Check if content is completed
            const contentProgress = sectionProgress?.contentProgress?.find(
              cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
            );

            if (contentProgress) {
              if (content.contentType === 'video') {
                if (contentProgress.watchedDuration >= content.minimumWatchTime) {
                  completedContent++;
                }
              } else if (content.contentType === 'text') {
                if (contentProgress.completed) {
                  completedContent++;
                }
              }
            }
          }
        }

        // Check quiz for this section
        if (section.quiz) {
          totalQuizzes++;

          // Find actual quiz result from Quiz collection
          const quizResult = courseQuizResults.find(quiz =>
            quiz.sectionId.toString() === section._id.toString()
          );

          if (quizResult) {
            // Get user's attempts for this quiz
            const userAttempts = quizResult.attempts.filter(
              attempt => attempt.userId.toString() === userId
            );

            if (userAttempts.length > 0) {
              hasAnyQuizAttempt = true;

              // Get best attempt
              const bestAttempt = userAttempts.reduce((best, current) =>
                current.percentage > best.percentage ? current : best
              );

              // Add quiz attempt details
              quizAttempts.push({
                quizId: quizResult._id,
                quizTitle: quizResult.title,
                sectionTitle: section.title,
                chapterTitle: chapter.title,
                totalAttempts: userAttempts.length,
                maxAttempts: quizResult.maxAttempts,
                bestScore: bestAttempt.percentage,
                bestGrade: bestAttempt.grade,
                passed: bestAttempt.passed,
                lastAttemptDate: bestAttempt.attemptDate,
                timeLimit: quizResult.timeLimit,
                passingScore: quizResult.passingScore
              });

              totalPossibleQuizScore += 100;
              totalQuizScore += bestAttempt.percentage;

              if (bestAttempt.passed && bestAttempt.percentage >= 70) {
                passedQuizzes++;
              } else {
                failedQuizzes++;
                hasAnyFailedQuiz = true;
              }
            } else {
              totalPossibleQuizScore += 100;

              // Add quiz not attempted
              quizAttempts.push({
                quizId: quizResult._id,
                quizTitle: quizResult.title,
                sectionTitle: section.title,
                chapterTitle: chapter.title,
                totalAttempts: 0,
                maxAttempts: quizResult.maxAttempts,
                bestScore: 0,
                bestGrade: 'Not Attempted',
                passed: false,
                lastAttemptDate: null,
                timeLimit: quizResult.timeLimit,
                passingScore: quizResult.passingScore
              });
            }
          } else {
            totalPossibleQuizScore += 100;
          }
        }

        // Determine if section is completed (same logic as before)
        let sectionCompleted = true;

        // Check content completion
        if (section.content && section.content.length > 0) {
          const sectionContentCount = section.content.length;
          const sectionCompletedContent = section.content.filter(content => {
            const contentProgress = sectionProgress?.contentProgress?.find(
              cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
            );

            if (!contentProgress) return false;

            if (content.contentType === 'video') {
              return contentProgress.watchedDuration >= content.minimumWatchTime;
            } else if (content.contentType === 'text') {
              return contentProgress.completed;
            }
            return false;
          }).length;

          if (sectionCompletedContent < sectionContentCount) {
            sectionCompleted = false;
          }
        }

        // Check quiz completion
        if (section.quiz && sectionCompleted) {
          const quizResult = courseQuizResults.find(quiz =>
            quiz.sectionId.toString() === section._id.toString()
          );

          if (quizResult) {
            const userAttempts = quizResult.attempts.filter(
              attempt => attempt.userId.toString() === userId
            );

            if (userAttempts.length === 0) {
              sectionCompleted = false;
            } else {
              const bestAttempt = userAttempts.reduce((best, current) =>
                current.percentage > best.percentage ? current : best
              );

              if (!bestAttempt.passed || bestAttempt.percentage < 70) {
                sectionCompleted = false;
              }
            }
          } else {
            sectionCompleted = false;
          }
        }

        if (sectionCompleted) {
          completedSections++;
        }
      }
    }

    // Calculate overall progress
    const contentProgress = totalContent > 0 ? (completedContent / totalContent) * 100 : 0;
    const sectionProgress = totalSections > 0 ? (completedSections / totalSections) * 100 : 0;
    const overallProgress = Math.round((contentProgress + sectionProgress) / 2);

    // Calculate grade
    const gradePercentage = totalPossibleQuizScore > 0 ?
      Math.round((totalQuizScore / totalPossibleQuizScore) * 100) : 0;

    let gradeLabel = 'Incomplete';
    if (gradePercentage >= 90) gradeLabel = 'A';
    else if (gradePercentage >= 80) gradeLabel = 'B';
    else if (gradePercentage >= 70) gradeLabel = 'C';
    else if (gradePercentage >= 60) gradeLabel = 'D';
    else if (gradePercentage > 0) gradeLabel = 'F';

    // Determine status
    let status = 'Not Started';
    let certificateStatus = 'Not Eligible';

    // Check enrollment status first
    if (enrollment.status) {
      status = enrollment.status;

      // Set certificate status based on enrollment status
      if (status === 'Completed') {
        certificateStatus = enrollment.certificateRequestStatus === 'Requested' ? 'Requested' :
          enrollment.certificateRequestStatus === 'Approved' ? 'Approved' :
            enrollment.certificateRequestStatus === 'Rejected' ? 'Eligible' : 'Eligible';
      } else if (status === 'Done') {
        certificateStatus = 'Approved';
      } else if (status === 'Failed') {
        certificateStatus = 'Not Eligible';
      } else if (status === 'In Progress') {
        certificateStatus = 'Not Eligible';
      }
    } else {
      // Calculate status based on progress if not set
      if (overallProgress === 0 && !hasAnyQuizAttempt) {
        status = 'Not Started';
        certificateStatus = 'Not Eligible';
      } else if (hasAnyFailedQuiz) {
        status = 'Failed';
        gradeLabel = 'F';
        certificateStatus = 'Not Eligible';
      } else if (overallProgress === 100 && failedQuizzes === 0 && totalQuizzes > 0 && passedQuizzes === totalQuizzes) {
        if (gradePercentage >= course.passingGrade) {
          status = 'Completed';
          certificateStatus = 'Eligible';
        } else {
          status = 'Failed';
          certificateStatus = 'Not Eligible';
        }
      } else if (overallProgress > 0 || hasAnyQuizAttempt) {
        status = 'In Progress';
        certificateStatus = 'Not Eligible';
      }
    }

    // Override status based on certificate request status
    if (enrollment.certificateRequestStatus === 'Requested') {
      status = 'Completed';
      certificateStatus = 'Requested';
    } else if (enrollment.certificateRequestStatus === 'Approved') {
      status = 'Done';
      certificateStatus = 'Approved';
    } else if (enrollment.certificateRequestStatus === 'Rejected') {
      // status = 'Completed';
      certificateStatus = 'Eligible';
    }

    // Certificate information
    let certificateInfo = {
      eligible: certificateStatus === 'Eligible',
      requestStatus: enrollment.certificateRequestStatus || 'Not Eligible',
      requestId: enrollment.certificateRequestId || null,
      certificateRequest: null,
      canRequest: certificateStatus === 'Eligible' && status === 'Completed' // ✅ Only when completed, not requested
    };

    // Get certificate request details if exists
    if (enrollment.certificateRequestId) {
      try {
        const CertificateRequest = require('../models/certificateRequest.model');
        const certificateRequest = await CertificateRequest.findById(enrollment.certificateRequestId)
          .select('status certificateId createdAt reviewedAt certificateImagePath userSignaturePath presidentSignaturePath');

        if (certificateRequest) {
          certificateInfo.certificateRequest = {
            id: certificateRequest._id,
            status: certificateRequest.status,
            certificateId: certificateRequest.certificateId,
            createdAt: certificateRequest.createdAt,
            reviewedAt: certificateRequest.reviewedAt,
            certificateImagePath: certificateRequest.certificateImagePath,
            userSignaturePath: certificateRequest.userSignaturePath,
            presidentSignaturePath: certificateRequest.presidentSignaturePath
          };

          // 🆕 Update certificate status based on actual request status
          if (certificateRequest.status === 'Pending') {
            certificateInfo.requestStatus = 'Requested';
            certificateInfo.canRequest = false;
          } else if (certificateRequest.status === 'Approved' || certificateRequest.status === 'Certificate_Generated') {
            certificateInfo.requestStatus = 'Approved';
            certificateInfo.canRequest = false;
          } else if (certificateRequest.status === 'Rejected') {
            certificateInfo.requestStatus = 'Rejected';
            certificateInfo.eligible = true;
            certificateInfo.canRequest = true; // Can request again
          }
        }
      } catch (certError) {
        console.error('Error fetching certificate request:', certError);
      }
    }

    return {
      _id: course._id,
      name: course.name,
      description: course.description,
      thumbnail: course.thumbnail,
      level: course.level,
      courseType: course.courseType || 'Course',
      language: course.language,
      approximateHours: course.approximateHours,
      totalVideos: course.totalVideos,
      progress: overallProgress,
      gradePercentage: gradePercentage,
      gradeLabel: gradeLabel,
      status: status,
      statusDisplay: getStatusDisplay(status),
      weightage: course.weightage || 0,
      certificateInfo: certificateInfo,

      // 🆕 DETAILED STATS FOR ADMIN
      // 🆕 DETAILED STATS FOR ADMIN - ADD MISSING FIELDS
      detailedStats: {
        enrollmentDate: enrollment.enrollmentDate,
        lastAccessDate: enrollment.lastAccessDate || enrollment.enrollmentDate,
        completionDate: enrollment.completionDate || null, // ✅ Add null check
        totalTimeSpent: enrollment.totalTimeSpent || 0,

        contentStats: {
          totalSections: totalSections,
          completedSections: completedSections,
          totalContent: totalContent,
          completedContent: completedContent,
          sectionProgress: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
          contentProgress: totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0
        },

        quizStats: {
          total: totalQuizzes,
          completed: passedQuizzes,
          failed: failedQuizzes,
          notAttempted: totalQuizzes - passedQuizzes - failedQuizzes,
          percentage: totalQuizzes > 0 ? Math.round((passedQuizzes / totalQuizzes) * 100) : 0,
          averageScore: totalQuizzes > 0 ? Math.round(totalQuizScore / totalQuizzes) : 0,
          attempts: quizAttempts
        },

        // 🆕 ADD PERFORMANCE METRICS
        performance: {
          efficiency: calculateEfficiency(overallProgress, enrollment.totalTimeSpent, course.approximateHours),
          riskLevel: calculateRiskLevel(overallProgress, gradePercentage, enrollment),
          needsAttention: checkNeedsAttention(overallProgress, gradePercentage, enrollment, hasAnyFailedQuiz)
        }
      }

    };

  } catch (error) {
    console.error('Error calculating course progress:', error);
    return createEmptyCourseProgress(course, enrollment);
  }
};


// 🆕 ADD THESE HELPER FUNCTIONS AFTER calculateCourseProgress





// const createEmptyCourseProgress = (course, enrollment) => {
//   return {
//     _id: course._id,
//     name: course.name,
//     description: course.description,
//     thumbnail: course.thumbnail,
//     level: course.level,
//     courseType: course.courseType || 'Course',
//     language: course.language,
//     approximateHours: course.approximateHours,
//     totalVideos: course.totalVideos,
//     progress: 0,
//     gradePercentage: 0,
//     gradeLabel: 'Incomplete',
//     status: 'Not Started',
//     statusDisplay: 'Not Started',
//     weightage: course.weightage || 0,
//     certificateInfo: {
//       eligible: false,
//       requestStatus: 'Not Eligible',
//       requestId: null,
//       certificateRequest: null,
//       canRequest: false
//     },
//     detailedStats: {
//       enrollmentDate: enrollment.enrollmentDate,
//       lastAccessDate: enrollment.lastAccessDate || enrollment.enrollmentDate,
//       completionDate: null,
//       totalTimeSpent: 0,
//       contentStats: {
//         totalSections: 0,
//         completedSections: 0,
//         totalContent: 0,
//         completedContent: 0,
//         sectionProgress: 0,
//         contentProgress: 0
//       },
//       quizStats: {
//         total: 0,
//         completed: 0,
//         failed: 0,
//         notAttempted: 0,
//         percentage: 0,
//         averageScore: 0,
//         attempts: []
//       }
//     }
//   };
// };



// get specific user:
const getUserProgressById = async (req, res) => {
  try {
    const { userId } = req.params;
     const warehouseID = req?.user?.selectedWarehouse;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    console.log(`Admin getting progress for user: ${userId}`);

    // Get customer details
    const customer = await Customer.findById(userId)
      .populate('role', 'name')
      .populate('warehouse', 'name location');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    const selectedwarehouse = await Warehouse.findById(warehouseID);
    console.log(`Selected warehouse: ${selectedwarehouse ? selectedwarehouse.name : 'None'}`);
    // Get all courses with enrollments
    const courses = await Course.find({
      isActive: true,
      'enrolledUsers.user': userId
    })
      .select('name description thumbnail level courseType language approximateHours totalVideos status passingGrade chapters enrolledUsers weightage')
      .populate({
        path: 'enrolledUsers.certificateRequestId',
        model: 'CertificateRequest',
        select: 'status certificateId createdAt reviewedAt certificateImagePath'
      });

    console.log(`Found ${courses.length} courses for user ${customer.username}`);

    // Get all quiz results for this user
    const allQuizResults = await Quiz.find({
      'attempts.userId': userId
    });

    // Process user's courses
    const processedCourses = [];
    let totalProgress = 0;
    let completedCourses = 0;
    let inProgressCourses = 0;
    let failedCourses = 0;
    let certificatesEarned = 0;

    for (const course of courses) {
      // Find user's enrollment in this course
      const enrollment = course.enrolledUsers.find(
        e => e && e.user && e.user.toString() === userId
      );

      if (!enrollment) continue;

      // Get quiz results for this course
      const courseQuizResults = allQuizResults.filter(quiz =>
        quiz.courseId.toString() === course._id.toString()
      );

      // Calculate detailed progress
      const courseProgress = await calculateCourseProgress(
        course,
        enrollment,
        courseQuizResults,
        userId
      );

      processedCourses.push(courseProgress);

      // Update totals
      totalProgress += courseProgress.progress;

      if (courseProgress.status === 'Completed' || courseProgress.status === 'Done') {
        completedCourses++;
      } else if (courseProgress.status === 'In Progress' || courseProgress.status === 'Requested') {
        inProgressCourses++;
      } else if (courseProgress.status === 'Failed') {
        failedCourses++;
      }

      if (courseProgress.certificateInfo.requestStatus === 'Approved') {
        certificatesEarned++;
      }
    }

    // Calculate average progress
    const averageProgress = courses.length > 0 ?
      Math.round(totalProgress / courses.length) : 0;

    // Separate main courses and short courses
    const mainCourses = processedCourses.filter(course =>
      course.courseType === 'Course'
    );

    const shortCourses = processedCourses.filter(course =>
      course.courseType === 'Short Course'
    );

    // Get recent activity (last 10 quiz attempts)
    const recentActivity = [];
    for (const course of processedCourses) {
      if (course.detailedStats.quizStats.attempts.length > 0) {
        course.detailedStats.quizStats.attempts.forEach(attempt => {
          if (attempt.lastAttemptDate) {
            recentActivity.push({
              type: 'quiz_attempt',
              courseName: course.name,
              quizTitle: attempt.quizTitle,
              score: attempt.bestScore,
              passed: attempt.passed,
              date: attempt.lastAttemptDate
            });
          }
        });
      }
    }

    // Sort recent activity by date
    recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));
    const limitedRecentActivity = recentActivity.slice(0, 10);

    const userProgressData = {
      _id: customer._id,
      username: customer.username,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      role: customer.role ? {
        _id: customer.role._id,
        name: customer.role.name
      } : null,
      warehouse: customer.warehouse ? {
        _id: customer.warehouse._id,
        name: customer.warehouse.name,
        location: customer.warehouse.location
      } : null,
      profilePicture: customer.profilePicture,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      lastLogin: customer.lastLogin,

      // 🆕 DETAILED PROGRESS SUMMARY
      progressSummary: {
        totalEnrolled: courses.length,
        mainCoursesCount: mainCourses.length,
        shortCoursesCount: shortCourses.length,
        completedCourses,
        inProgressCourses,
        failedCourses,
        certificatesEarned,
        averageProgress,

        // Certificate summary
        certificateRequested: processedCourses.filter(c => c.certificateInfo.requestStatus === 'Requested').length,
        certificateApproved: processedCourses.filter(c => c.certificateInfo.requestStatus === 'Approved').length,

        // Performance metrics
        totalQuizAttempts: processedCourses.reduce((sum, c) =>
          sum + c.detailedStats.quizStats.attempts.reduce((attemptSum, a) => attemptSum + a.totalAttempts, 0), 0
        ),
        averageQuizScore: processedCourses.length > 0 ?
          Math.round(processedCourses.reduce((sum, c) => sum + c.detailedStats.quizStats.averageScore, 0) / processedCourses.length) : 0,

        // Time tracking
        totalTimeSpent: processedCourses.reduce((sum, c) => sum + (c.detailedStats.totalTimeSpent || 0), 0),
        averageTimePerCourse: courses.length > 0 ?
          Math.round(processedCourses.reduce((sum, c) => sum + (c.detailedStats.totalTimeSpent || 0), 0) / courses.length) : 0
      },

      // 🆕 DETAILED COURSE DATA
      courses: {
        mainCourses: mainCourses,
        shortCourses: shortCourses
      },

      // 🆕 RECENT ACTIVITY
      recentActivity: limitedRecentActivity
    };

    res.status(200).json({
      success: true,
      message: 'User progress retrieved successfully',
      data: userProgressData
    });

  } catch (error) {
    console.error('Error getting user progress by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user progress',
      error: error.message
    });
  }
};



const getCourseUsersProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = 'progress',
      sortOrder = 'desc'
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID'
      });
    }

    console.log(`Admin getting users progress for course: ${courseId}`);

    // Get course details
    const course = await Course.findById(courseId)
      .select('name description thumbnail level courseType language approximateHours totalVideos status passingGrade chapters enrolledUsers weightage')
      .populate({
        path: 'enrolledUsers.user',
        model: 'Customer',
        select: 'username email firstName lastName profilePicture isActive createdAt lastLogin',
        populate: [
          { path: 'role', select: 'name' },
          { path: 'warehouse', select: 'name location' }
        ]
      })
      .populate({
        path: 'enrolledUsers.certificateRequestId',
        model: 'CertificateRequest',
        select: 'status certificateId createdAt reviewedAt certificateImagePath'
      });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    console.log(`Course "${course.name}" has ${course.enrolledUsers.length} enrolled users`);

    // Get quiz results for this course
    const courseQuizResults = await Quiz.find({ courseId: courseId });

    // Process enrolled users
    let processedUsers = [];

    for (const enrollment of course.enrolledUsers) {
      if (!enrollment.user) continue;

      const user = enrollment.user;

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          user.username?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user.firstName?.toLowerCase().includes(searchLower) ||
          user.lastName?.toLowerCase().includes(searchLower);

        if (!matchesSearch) continue;
      }

      // Get user's quiz results for this course
      const userQuizResults = courseQuizResults.filter(quiz =>
        quiz.attempts.some(attempt => attempt.userId.toString() === user._id.toString())
      );

      // Calculate course progress for this user
      const courseProgress = await calculateCourseProgress(
        course,
        enrollment,
        userQuizResults,
        user._id.toString()
      );

      // Apply status filter
      if (status && courseProgress.status !== status) continue;

      processedUsers.push({
        _id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        profilePicture: user.profilePicture,
        isActive: user.isActive,
        role: user.role ? {
          _id: user.role._id,
          name: user.role.name
        } : null,
        warehouse: user.warehouse ? {
          _id: user.warehouse._id,
          name: user.warehouse.name,
          location: user.warehouse.location
        } : null,

        // 🆕 COURSE SPECIFIC PROGRESS
        courseProgress: {
          progress: courseProgress.progress,
          gradePercentage: courseProgress.gradePercentage,
          gradeLabel: courseProgress.gradeLabel,
          status: courseProgress.status,
          statusDisplay: courseProgress.statusDisplay,

          // Enrollment details
          enrollmentDate: enrollment.enrollmentDate,
          lastAccessDate: enrollment.lastAccessDate || enrollment.enrollmentDate,
          completionDate: enrollment.completionDate,

          // Certificate info
          certificateInfo: courseProgress.certificateInfo,

          // Detailed stats
          contentStats: courseProgress.detailedStats.contentStats,
          quizStats: courseProgress.detailedStats.quizStats,

          // Performance indicators
          timeSpent: courseProgress.detailedStats.totalTimeSpent || 0,
          efficiency: calculateEfficiency(courseProgress, course.approximateHours),

          // Risk indicators
          riskLevel: calculateRiskLevel(courseProgress, enrollment),
          needsAttention: checkNeedsAttention(courseProgress, enrollment)
        }
      });
    }

    // Sort users
    processedUsers.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'progress':
          aValue = a.courseProgress.progress;
          bValue = b.courseProgress.progress;
          break;
        case 'grade':
          aValue = a.courseProgress.gradePercentage;
          bValue = b.courseProgress.gradePercentage;
          break;
        case 'enrollmentDate':
          aValue = new Date(a.courseProgress.enrollmentDate);
          bValue = new Date(b.courseProgress.enrollmentDate);
          break;
        case 'lastAccess':
          aValue = new Date(a.courseProgress.lastAccessDate);
          bValue = new Date(b.courseProgress.lastAccessDate);
          break;
        case 'username':
          aValue = a.username?.toLowerCase() || '';
          bValue = b.username?.toLowerCase() || '';
          break;
        default:
          aValue = a.courseProgress.progress;
          bValue = b.courseProgress.progress;
      }

      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Apply pagination
    const totalUsers = processedUsers.length;
    const skip = (page - 1) * limit;
    const paginatedUsers = processedUsers.slice(skip, skip + parseInt(limit));

    // Calculate course statistics
    const courseStats = {
      totalEnrolled: processedUsers.length,
      completed: processedUsers.filter(u => u.courseProgress.status === 'Completed' || u.courseProgress.status === 'Done').length,
      inProgress: processedUsers.filter(u => u.courseProgress.status === 'In Progress').length,
      failed: processedUsers.filter(u => u.courseProgress.status === 'Failed').length,
      notStarted: processedUsers.filter(u => u.courseProgress.status === 'Not Started').length,
      certificateRequested: processedUsers.filter(u => u.courseProgress.certificateInfo.requestStatus === 'Requested').length,
      certificateApproved: processedUsers.filter(u => u.courseProgress.certificateInfo.requestStatus === 'Approved').length,

      // Performance metrics
      averageProgress: processedUsers.length > 0 ?
        Math.round(processedUsers.reduce((sum, u) => sum + u.courseProgress.progress, 0) / processedUsers.length) : 0,
      averageGrade: processedUsers.length > 0 ?
        Math.round(processedUsers.reduce((sum, u) => sum + u.courseProgress.gradePercentage, 0) / processedUsers.length) : 0,

      // Risk analysis
      highRisk: processedUsers.filter(u => u.courseProgress.riskLevel === 'High').length,
      mediumRisk: processedUsers.filter(u => u.courseProgress.riskLevel === 'Medium').length,
      lowRisk: processedUsers.filter(u => u.courseProgress.riskLevel === 'Low').length,
      needsAttention: processedUsers.filter(u => u.courseProgress.needsAttention).length
    };

    res.status(200).json({
      success: true,
      message: 'Course users progress retrieved successfully',
      data: {
        course: {
          _id: course._id,
          name: course.name,
          description: course.description,
          thumbnail: course.thumbnail,
          level: course.level,
          courseType: course.courseType,
          approximateHours: course.approximateHours,
          totalVideos: course.totalVideos,
          passingGrade: course.passingGrade
        },
        users: paginatedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers: totalUsers,
          hasNextPage: page * limit < totalUsers,
          hasPrevPage: page > 1
        },
        courseStats,
        filters: {
          status: status || null,
          search: search || null,
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Error getting course users progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get course users progress',
      error: error.message
    });
  }
};



// search courses:
const searchCourses = async (req, res) => {
  try {
    const {
      query,
      page = 1,
      limit = 10
    } = req.query;

    console.log('Course search request:', { query, page, limit });

    // Validate search query
    if (!query || query.trim().length < 1) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = query.trim();

    // 🆕 WORD BY WORD SEARCH - Split search term and create regex
    const searchWords = searchTerm.split(' ').filter(word => word.length > 0);
    const searchRegex = new RegExp(searchWords.join('|'), 'i'); // Match any word
    const exactRegex = new RegExp(searchTerm, 'i'); // Exact phrase match

    console.log('Searching courses with term:', searchTerm);

    // 🆕 SEARCH COURSES BY NAME
    const courses = await Course.find({
      isActive: true,
      name: searchRegex // Word by word search in course name
    })
      .populate('accessControl.roles', 'name')
      .populate('accessControl.stores', 'name location')
      .select('name description thumbnail level courseType language approximateHours totalVideos sequence passingGrade enrolledUsers createdAt')
      .sort({ name: 1 }); // Sort by name alphabetically

    console.log(`Found ${courses.length} courses matching "${searchTerm}"`);

    // 🆕 CALCULATE RELEVANCE AND SORT
    const processedCourses = courses.map(course => {
      let relevanceScore = 0;

      // Higher score for exact match
      if (exactRegex.test(course.name)) {
        relevanceScore += 10;
      }

      // Score for word matches
      searchWords.forEach(word => {
        const wordRegex = new RegExp(word, 'i');
        if (wordRegex.test(course.name)) {
          relevanceScore += 3;
        }
      });

      // Bonus if course name starts with search term
      if (course.name.toLowerCase().startsWith(searchTerm.toLowerCase())) {
        relevanceScore += 5;
      }

      return {
        _id: course._id,
        name: course.name,
        courseDuration: course.courseDuration,
        description: course.description,
        thumbnail: course.thumbnail,
        level: course.level,
        courseType: course.courseType,
        language: course.language,
        approximateHours: course.approximateHours,
        totalVideos: course.totalVideos,
        sequence: course.sequence,
        passingGrade: course.passingGrade,
        totalEnrolled: course.enrolledUsers.length,
        createdAt: course.createdAt,
        relevanceScore: relevanceScore
      };
    });

    // Sort by relevance score (highest first)
    processedCourses.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply pagination
    const totalCourses = processedCourses.length;
    const skip = (page - 1) * limit;
    const paginatedCourses = processedCourses.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Course search completed successfully',
      data: {
        courses: paginatedCourses,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCourses / limit),
          totalCourses: totalCourses,
          hasNextPage: page * limit < totalCourses,
          hasPrevPage: page > 1,
          limit: parseInt(limit)
        },
        searchInfo: {
          query: searchTerm,
          searchWords: searchWords,
          resultsFound: totalCourses
        }
      }
    });

  } catch (error) {
    console.error('Error searching courses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search courses',
      error: error.message
    });
  }
};



// const calculateEfficiency = (courseProgress, approximateHours) => {
//   if (!courseProgress.detailedStats.totalTimeSpent || !approximateHours) {
//     return 'Unknown';
//   }

//   const expectedTimeInMinutes = approximateHours * 60;
//   const actualTimeInMinutes = courseProgress.detailedStats.totalTimeSpent;

//   if (actualTimeInMinutes <= expectedTimeInMinutes * 0.8) {
//     return 'High'; // Completed faster than expected
//   } else if (actualTimeInMinutes <= expectedTimeInMinutes * 1.2) {
//     return 'Normal'; // Within expected range
//   } else {
//     return 'Low'; // Taking longer than expected
//   }
// };




// Helper functions (same as before)

const calculateEfficiency = (progress, timeSpent, approximateHours) => {
  if (!timeSpent || !approximateHours) return 'Unknown';

  const expectedTimeInMinutes = approximateHours * 60;
  const actualTimeInMinutes = timeSpent;

  if (progress === 0) return 'Not Started';

  const timeRatio = actualTimeInMinutes / expectedTimeInMinutes;
  const progressRatio = progress / 100;

  if (progressRatio > timeRatio * 1.2) return 'High';
  else if (progressRatio > timeRatio * 0.8) return 'Normal';
  else return 'Low';
};

const calculateRiskLevel = (progress, gradePercentage, enrollment) => {
  let riskScore = 0;

  if (progress < 25) riskScore += 3;
  else if (progress < 50) riskScore += 2;
  else if (progress < 75) riskScore += 1;

  if (gradePercentage < 50) riskScore += 3;
  else if (gradePercentage < 70) riskScore += 2;

  const daysSinceEnrollment = Math.floor(
    (new Date() - new Date(enrollment.enrollmentDate)) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceEnrollment > 30 && progress < 50) riskScore += 3;
  else if (daysSinceEnrollment > 14 && progress < 25) riskScore += 2;

  const lastAccess = new Date(enrollment.lastAccessDate || enrollment.enrollmentDate);
  const daysSinceLastAccess = Math.floor((new Date() - lastAccess) / (1000 * 60 * 60 * 24));

  if (daysSinceLastAccess > 14) riskScore += 3;
  else if (daysSinceLastAccess > 7) riskScore += 2;

  if (riskScore >= 8) return 'High';
  else if (riskScore >= 5) return 'Medium';
  else return 'Low';
};

const checkNeedsAttention = (progress, gradePercentage, enrollment, hasFailedQuiz) => {
  if (enrollment.status === 'Failed') return true;

  const daysSinceEnrollment = Math.floor(
    (new Date() - new Date(enrollment.enrollmentDate)) / (1000 * 60 * 60 * 24)
  );

  if (progress < 25 && daysSinceEnrollment > 7) return true;
  if (progress < 50 && daysSinceEnrollment > 21) return true;
  if (gradePercentage > 0 && gradePercentage < 50) return true;
  if (hasFailedQuiz) return true;

  const lastAccess = new Date(enrollment.lastAccessDate || enrollment.enrollmentDate);
  const daysSinceLastAccess = Math.floor((new Date() - lastAccess) / (1000 * 60 * 60 * 24));

  if (daysSinceLastAccess > 14 && progress > 0) return true;

  return false;
};


// Calculate risk level
// const calculateRiskLevel = (courseProgress, enrollment) => {
//   let riskScore = 0;

//   // Progress risk
//   if (courseProgress.progress < 25) riskScore += 3;
//   else if (courseProgress.progress < 50) riskScore += 2;
//   else if (courseProgress.progress < 75) riskScore += 1;

//   // Grade risk
//   if (courseProgress.gradePercentage < 50) riskScore += 3;
//   else if (courseProgress.gradePercentage < 70) riskScore += 2;

//   // Quiz failure risk
//   const failedQuizzes = courseProgress.detailedStats.quizStats.failed;
//   const totalQuizzes = courseProgress.detailedStats.quizStats.total;
//   if (totalQuizzes > 0) {
//     const failureRate = (failedQuizzes / totalQuizzes) * 100;
//     if (failureRate > 50) riskScore += 3;
//     else if (failureRate > 25) riskScore += 2;
//     else if (failureRate > 0) riskScore += 1;
//   }

//   // Time since last access
//   const lastAccess = new Date(enrollment.lastAccessDate || enrollment.enrollmentDate);
//   const daysSinceLastAccess = Math.floor((new Date() - lastAccess) / (1000 * 60 * 60 * 24));

//   if (daysSinceLastAccess > 14) riskScore += 3;
//   else if (daysSinceLastAccess > 7) riskScore += 2;
//   else if (daysSinceLastAccess > 3) riskScore += 1;

//   // Determine risk level
//   if (riskScore >= 8) return 'High';
//   else if (riskScore >= 5) return 'Medium';
//   else return 'Low';
// };

// Check if user needs attention
// const checkNeedsAttention = (courseProgress, enrollment) => {
//   // Failed status
//   if (courseProgress.status === 'Failed') return true;

//   // Low progress with long enrollment time
//   const enrollmentDays = Math.floor((new Date() - new Date(enrollment.enrollmentDate)) / (1000 * 60 * 60 * 24));
//   if (courseProgress.progress < 25 && enrollmentDays > 7) return true;

//   // Multiple quiz failures
//   const failedQuizzes = courseProgress.detailedStats.quizStats.failed;
//   if (failedQuizzes >= 2) return true;

//   // No activity for long time
//   const lastAccess = new Date(enrollment.lastAccessDate || enrollment.enrollmentDate);
//   const daysSinceLastAccess = Math.floor((new Date() - lastAccess) / (1000 * 60 * 60 * 24));
//   if (daysSinceLastAccess > 14 && courseProgress.progress > 0) return true;

//   return false;
// };



// admin analysis:
const getDashboardSummary = async (req, res) => {
  try {
    console.log("Getting admin dashboard summary...");

    // Get total counts
    const totalUsers = await Customer.countDocuments({ isActive: true });
    const totalCourses = await Course.countDocuments({ isActive: true });
    const totalQuizzes = await Quiz.countDocuments({ isActive: true });

    // Get certificate requests summary
    const CertificateRequest = require('../models/certificateRequest.model');
    const certificateStats = await CertificateRequest.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const certificateSummary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      generated: 0,
      total: 0
    };

    certificateStats.forEach(stat => {
      switch (stat._id) {
        case 'Pending':
          certificateSummary.pending = stat.count;
          break;
        case 'Approved':
          certificateSummary.approved = stat.count;
          break;
        case 'Rejected':
          certificateSummary.rejected = stat.count;
          break;
        case 'Certificate_Generated':
          certificateSummary.generated = stat.count;
          break;
      }
      certificateSummary.total += stat.count;
    });

    // Get enrollment statistics
    const courses = await Course.find({ isActive: true })
      .select('name enrolledUsers courseType');

    let totalEnrollments = 0;
    let completedEnrollments = 0;
    let inProgressEnrollments = 0;
    let failedEnrollments = 0;
    let courseTypeStats = {
      'Course': 0,
      'Short Course': 0,
      'Task': 0
    };

    courses.forEach(course => {
      totalEnrollments += course.enrolledUsers.length;
      courseTypeStats[course.courseType] = (courseTypeStats[course.courseType] || 0) + course.enrolledUsers.length;

      course.enrolledUsers.forEach(enrollment => {
        if (enrollment.status === 'Completed' || enrollment.status === 'Done') {
          completedEnrollments++;
        } else if (enrollment.status === 'In Progress' || enrollment.status === 'Requested') {
          inProgressEnrollments++;
        } else if (enrollment.status === 'Failed') {
          failedEnrollments++;
        }
      });
    });

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentEnrollments = await Course.aggregate([
      { $unwind: '$enrolledUsers' },
      { $match: { 'enrolledUsers.enrollmentDate': { $gte: sevenDaysAgo } } },
      { $count: 'total' }
    ]);

    const recentCertificateRequests = await CertificateRequest.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Get top performing courses
    const topCourses = await Course.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $addFields: {
          enrollmentCount: { $size: '$enrolledUsers' },
          completedCount: {
            $size: {
              $filter: {
                input: '$enrolledUsers',
                cond: {
                  $or: [
                    { $eq: ['$$this.status', 'Completed'] },
                    { $eq: ['$$this.status', 'Done'] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          completionRate: {
            $cond: [
              { $gt: ['$enrollmentCount', 0] },
              { $multiply: [{ $divide: ['$completedCount', '$enrollmentCount'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: { enrollmentCount: -1 }
      },
      {
        $limit: 5
      },
      {
        $project: {
          name: 1,
          thumbnail: 1,
          courseType: 1,
          level: 1,
          enrollmentCount: 1,
          completedCount: 1,
          completionRate: { $round: ['$completionRate', 1] }
        }
      }
    ]);

    // Get users needing attention (high risk users)
    const usersNeedingAttention = await Customer.find({ isActive: true })
      .populate('role', 'name')
      .populate('warehouse', 'name')
      .limit(10)
      .select('username email firstName lastName profilePicture');

    // Calculate risk for each user (simplified version)
    const riskyUsers = [];
    for (const user of usersNeedingAttention) {
      const userCourses = await Course.find({
        'enrolledUsers.user': user._id,
        isActive: true
      }).select('enrolledUsers name');

      let totalRiskScore = 0;
      let courseCount = 0;

      for (const course of userCourses) {
        const enrollment = course.enrolledUsers.find(
          e => e.user && e.user.toString() === user._id.toString()
        );

        if (enrollment) {
          courseCount++;

          // Simple risk calculation
          let riskScore = 0;
          if (enrollment.progress < 25) riskScore += 3;
          if (enrollment.gradePercentage < 50) riskScore += 3;
          if (enrollment.status === 'Failed') riskScore += 5;

          const daysSinceEnrollment = Math.floor(
            (new Date() - new Date(enrollment.enrollmentDate)) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceEnrollment > 14 && enrollment.progress < 50) riskScore += 2;

          totalRiskScore += riskScore;
        }
      }

      const averageRisk = courseCount > 0 ? totalRiskScore / courseCount : 0;

      if (averageRisk >= 5) {
        riskyUsers.push({
          _id: user._id,
          username: user.username,
          email: user.email,
          fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          profilePicture: user.profilePicture,
          role: user.role,
          warehouse: user.warehouse,
          riskScore: Math.round(averageRisk),
          enrolledCourses: courseCount
        });
      }
    }

    // Sort risky users by risk score
    riskyUsers.sort((a, b) => b.riskScore - a.riskScore);

    // Get monthly enrollment trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrends = await Course.aggregate([
      { $unwind: '$enrolledUsers' },
      {
        $match: {
          'enrolledUsers.enrollmentDate': { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$enrolledUsers.enrollmentDate' },
            month: { $month: '$enrolledUsers.enrollmentDate' }
          },
          enrollments: { $sum: 1 },
          completions: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$enrolledUsers.status', 'Completed'] },
                    { $eq: ['$enrolledUsers.status', 'Done'] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Format monthly trends
    const formattedTrends = monthlyTrends.map(trend => ({
      month: `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}`,
      enrollments: trend.enrollments,
      completions: trend.completions,
      completionRate: trend.enrollments > 0 ?
        Math.round((trend.completions / trend.enrollments) * 100) : 0
    }));

    // System health indicators
    const systemHealth = {
      activeUsers: totalUsers,
      activeCourses: totalCourses,
      recentActivity: {
        newEnrollments: recentEnrollments[0]?.total || 0,
        certificateRequests: recentCertificateRequests
      },
      performance: {
        averageCompletionRate: totalEnrollments > 0 ?
          Math.round((completedEnrollments / totalEnrollments) * 100) : 0,
        usersAtRisk: riskyUsers.length,
        pendingCertificates: certificateSummary.pending
      }
    };

    const dashboardData = {
      // 🆕 OVERVIEW STATS
      overview: {
        totalUsers,
        totalCourses,
        totalQuizzes,
        totalEnrollments,
        completedEnrollments,
        inProgressEnrollments,
        failedEnrollments,
        completionRate: totalEnrollments > 0 ?
          Math.round((completedEnrollments / totalEnrollments) * 100) : 0
      },

      // 🆕 CERTIFICATE SUMMARY
      certificates: certificateSummary,

      // 🆕 COURSE TYPE BREAKDOWN
      courseTypes: courseTypeStats,

      // 🆕 TOP PERFORMING COURSES
      topCourses,

      // 🆕 USERS NEEDING ATTENTION
      riskyUsers: riskyUsers.slice(0, 10),

      // 🆕 MONTHLY TRENDS
      monthlyTrends: formattedTrends,

      // 🆕 SYSTEM HEALTH
      systemHealth,

      // 🆕 RECENT ACTIVITY SUMMARY
      recentActivity: {
        newEnrollments: recentEnrollments[0]?.total || 0,
        certificateRequests: recentCertificateRequests,
        period: '7 days'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Dashboard summary retrieved successfully',
      data: dashboardData
    });

  } catch (error) {
    console.error('Error getting dashboard summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard summary',
      error: error.message
    });
  }
};









// Upload image from React Quill editor
/**
 * Proxy endpoint to stream videos from Bunny.net with proper CORS headers
 * This solves CORS issues when accessing Bunny.net CDN directly from frontend
 */
const streamVideo = async (req, res) => {
  try {
    const { videoUrl } = req.query;
    
    if (!videoUrl) {
      return res.status(400).json({ message: 'Video URL is required' });
    }

    // Validate that the URL is from Bunny.net (security check)
    if (!videoUrl.includes('b-cdn.net') && !videoUrl.includes('bunnycdn.com')) {
      return res.status(400).json({ message: 'Invalid video URL' });
    }

    // Set CORS headers first
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    // Prepare headers for Bunny.net CDN request
    // Note: CDN requests don't require API key - only management API needs it
    // The API key is only for video.bunnycdn.com, not for b-cdn.net (CDN)
    const bunnyHeaders = {
      'Accept': 'video/*, application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    };
    
    // Check if this is an HLS playlist (.m3u8) - handle differently
    const isHlsPlaylist = videoUrl.includes('.m3u8') || videoUrl.includes('playlist.m3u8');
    
    if (isHlsPlaylist) {
      // For HLS playlists, fetch as text to rewrite segment URLs
      const playlistData = await axios.get(videoUrl, {
        responseType: 'text',
        headers: bunnyHeaders,
      });

      // Rewrite segment URLs in the playlist to use our proxy
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const proxyBase = `${baseUrl}/api/courses/video-proxy?videoUrl=`;
      
      // Parse the original video URL to get base URL for relative segments
      const originalUrlObj = new URL(videoUrl);
      const basePath = originalUrlObj.origin + originalUrlObj.pathname.substring(0, originalUrlObj.pathname.lastIndexOf('/') + 1);
      
      // Replace segment URLs in the playlist
      let modifiedPlaylist = playlistData.data;
      
      // Match segment URLs - handle both absolute and relative
      // Pattern: lines that contain .ts (segment files) or .m3u8 (variant playlists)
      let segmentCount = 0;
      modifiedPlaylist = modifiedPlaylist.split('\n').map(line => {
        const trimmedLine = line.trim();
        
        // Skip comments and empty lines
        if (trimmedLine.startsWith('#') || !trimmedLine) {
          return line;
        }
        
        // Check if this line contains a segment URL (.ts files or variant .m3u8 playlists)
        // Exclude lines that are comments (start with #)
        if ((trimmedLine.includes('.ts') || trimmedLine.includes('.m3u8')) && !trimmedLine.startsWith('#')) {
          let segmentUrl = trimmedLine;
          
          // If relative URL, make it absolute using the base path
          if (!segmentUrl.startsWith('http://') && !segmentUrl.startsWith('https://')) {
            try {
              segmentUrl = new URL(segmentUrl, basePath).href;
            } catch (e) {
              console.warn(`[Proxy] Failed to construct absolute URL for: ${segmentUrl}`, e.message);
              return line; // Return original line if URL construction fails
            }
          }
          
          // Only proxy Bunny.net URLs
          if (segmentUrl.includes('b-cdn.net') || segmentUrl.includes('bunnycdn.com')) {
            const proxiedUrl = `${proxyBase}${encodeURIComponent(segmentUrl)}`;
            segmentCount++;
            // Replace the URL in the line while preserving any leading/trailing whitespace
            return line.replace(trimmedLine, proxiedUrl);
          }
        }
        
        return line;
      }).join('\n');
      
      console.log(`[Proxy] Rewrote HLS playlist: ${segmentCount} segment URL(s) proxied`);

      // Set content type for HLS playlist
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Content-Length', Buffer.byteLength(modifiedPlaylist));
      res.status(200);
      res.send(modifiedPlaylist);
      return;
    }

    // For non-HLS content (MP4, etc.), stream directly
    if (req.headers.range) {
      bunnyHeaders['Range'] = req.headers.range;
    }

    const response = await axios.get(videoUrl, {
      responseType: 'stream',
      headers: bunnyHeaders,
    });

    const contentType = response.headers['content-type'] || 'video/mp4';
    res.setHeader('Content-Type', contentType);

    // Forward content length and range headers from Bunny.net
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    
    if (response.headers['content-range']) {
      res.setHeader('Content-Range', response.headers['content-range']);
      res.status(206); // Partial Content
    } else {
      res.status(200); // OK
    }
    
    res.setHeader('Accept-Ranges', 'bytes');

    // Stream video from Bunny.net to client
    response.data.pipe(res);
    
    response.data.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
  } catch (error) {
    console.error('Error streaming video:', error.message);
    res.status(500).json({ 
      message: 'Failed to stream video',
      error: error.message 
    });
  }
};

const uploadQuillImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Get the file path and convert backslashes to forward slashes
    const imagePath = req.file.path.replace(/\\/g, '/');
    
    // Return the URL that can be used in React Quill
    // The frontend will need to prepend the BASE_API
    res.status(200).json({
      success: true,
      url: `/${imagePath}` // Return relative path, frontend will prepend BASE_API
    });
  } catch (error) {
    console.error('Error uploading Quill image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
};

module.exports = {
  streamVideo,
  uploadQuillImage,
  createCourse,
  updateVideoLikeDislike,
  getUserCourseProgress,
  getAvailableCoursesForUser,
  getCourseDetails,
  getAssignedCourses,
  getAllCourses,
  getCourseById,
  updateCourse,
  getUserCourseHistory,
  // deleteCourse,
  bulkDeleteCourses,
  updateWatchProgress,
  getVideoWithProgress,
  getRecentWatches,
  getCustomerCourses, // new route for customer courses
  getCourseChaptersAndSections, // new route for course chapters and sections
  getSectionDetails, // new route for section details
  toggleContentReaction,
  getAllCoursesSimplified,


  searchCourses,

  // admin :
  getAllUsersProgress,
  getUserProgressById,
  getCourseUsersProgress,
  getDashboardSummary,


  // Helper functions (if needed elsewhere)
  calculateCourseProgress,
  calculateEfficiency,
  calculateRiskLevel,
  checkNeedsAttention

};