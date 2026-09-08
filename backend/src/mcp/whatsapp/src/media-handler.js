const { downloadMediaMessage } = require('@whiskeysockets/baileys');

/**
 * Parses and extracts media details from an inbound WhatsApp message
 *
 * @param {object} messageObj - Baileys proto.IWebMessageInfo.message
 * @returns {{ isMedia: boolean, mediaType?: string, caption?: string, fileName?: string, mimeType?: string, mediaKey?: any }}
 */
const extractInboundMediaInfo = (messageObj) => {
  if (!messageObj) return { isMedia: false };

  if (messageObj.imageMessage) {
    return {
      isMedia: true,
      mediaType: 'image',
      caption: messageObj.imageMessage.caption || '',
      mimeType: messageObj.imageMessage.mimetype || 'image/jpeg',
      fileLength: messageObj.imageMessage.fileLength,
      rawMessage: messageObj,
    };
  }

  if (messageObj.documentMessage || messageObj.documentWithCaptionMessage?.message?.documentMessage) {
    const doc = messageObj.documentMessage || messageObj.documentWithCaptionMessage.message.documentMessage;
    return {
      isMedia: true,
      mediaType: 'document',
      caption: doc.caption || '',
      fileName: doc.fileName || 'document',
      mimeType: doc.mimetype || 'application/octet-stream',
      fileLength: doc.fileLength,
      rawMessage: messageObj,
    };
  }

  if (messageObj.videoMessage) {
    return {
      isMedia: true,
      mediaType: 'video',
      caption: messageObj.videoMessage.caption || '',
      mimeType: messageObj.videoMessage.mimetype || 'video/mp4',
      fileLength: messageObj.videoMessage.fileLength,
      rawMessage: messageObj,
    };
  }

  if (messageObj.audioMessage) {
    return {
      isMedia: true,
      mediaType: 'audio',
      caption: '',
      mimeType: messageObj.audioMessage.mimetype || 'audio/ogg',
      fileLength: messageObj.audioMessage.fileLength,
      rawMessage: messageObj,
    };
  }

  return { isMedia: false };
};

/**
 * Downloads media buffer from an inbound Baileys message
 *
 * @param {object} fullWAMessage - Full Baileys WAMessage object
 * @returns {Promise<Buffer|null>}
 */
const downloadInboundMediaBuffer = async (fullWAMessage) => {
  try {
    const buffer = await downloadMediaMessage(
      fullWAMessage,
      'buffer',
      {},
      {
        reuploadRequest: () => {
          throw new Error('Reupload required');
        },
      }
    );
    return buffer;
  } catch (err) {
    console.error('[WhatsApp Media] Failed to download media buffer:', err.message);
    return null;
  }
};

/**
 * Formats outbound media payload for sock.sendMessage()
 *
 * @param {object} params
 * @param {string} params.mediaUrl - URL or base64 data URI
 * @param {string} params.mediaType - 'image' | 'document' | 'audio' | 'video'
 * @param {string} [params.caption] - Optional text caption
 * @param {string} [params.filename] - Optional filename for document
 * @returns {object} Baileys AnyMessageContent object
 */
const formatOutboundMediaMessage = (params) => {
  const { mediaUrl, mediaType, caption, filename } = params;

  if (!mediaUrl) {
    throw new Error('mediaUrl is required for outbound media message.');
  }

  // Handle data URI if passed
  let mediaPayload;
  if (mediaUrl.startsWith('data:')) {
    const commaIdx = mediaUrl.indexOf(',');
    const base64Data = commaIdx > -1 ? mediaUrl.slice(commaIdx + 1) : mediaUrl;
    mediaPayload = Buffer.from(base64Data, 'base64');
  } else {
    mediaPayload = { url: mediaUrl };
  }

  switch (mediaType?.toLowerCase()) {
    case 'image':
      return {
        image: mediaPayload,
        caption: caption || undefined,
      };

    case 'document':
      return {
        document: mediaPayload,
        mimetype: 'application/pdf',
        fileName: filename || 'attachment.pdf',
        caption: caption || undefined,
      };

    case 'video':
      return {
        video: mediaPayload,
        caption: caption || undefined,
      };

    case 'audio':
      return {
        audio: mediaPayload,
        mimetype: 'audio/mp4',
        ptt: false,
      };

    default:
      // Default to document
      return {
        document: mediaPayload,
        mimetype: 'application/octet-stream',
        fileName: filename || 'file',
        caption: caption || undefined,
      };
  }
};

module.exports = {
  extractInboundMediaInfo,
  downloadInboundMediaBuffer,
  formatOutboundMediaMessage,
};
