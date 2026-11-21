export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Returns an error message for an unsupported file, or null when it can be uploaded.
export function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Only PNG, JPG, JPEG, and WEBP images are supported.";
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return "Image exceeds the maximum upload size of 5 MB.";
  }

  return null;
}
