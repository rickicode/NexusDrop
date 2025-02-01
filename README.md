# NexusDrop

NexusDrop is a high-speed download accelerator that leverages mirror servers to download files quickly and efficiently. When a user submits a URL, the server transforms the URL to use a high-speed mirror (via [0ms.dev](https://0ms.dev/mirrors)) before handling the download. This is especially useful for slow or unstable connections and for downloading large files.

## Features

- **Mirror Download:** Automatically converts submitted URLs into mirror URLs using `https://get.0ms.dev/` for faster downloads.
- **Progress Tracking:** Monitors download progress and handles errors.
- **Automatic Cleanup:** Removes expired or stuck downloads to keep your storage clean.
- **Responsive UI:** A sleek user interface with cloud-like particle visuals.
- **Open Source:** Easy to set up and extend.

## Deployment Options

### 1. Local Installation

#### Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or above recommended)
- [npm](https://www.npmjs.com/)

#### Steps

### 2. Cloud Deployment (Work in Progress)

To deploy this application to cloud platforms like Vercel, additional configuration is required:

**Required Changes for Cloud Deployment:**
1. Integration with cloud storage service (e.g., AWS S3, Google Cloud Storage)
2. Database for storing download states (e.g., MongoDB Atlas, Supabase)
3. Environment configuration for cloud services

Status: Cloud deployment support is currently under development. For now, please use the local installation method.

**Planned Storage Solutions:**
- File Storage: AWS S3 or similar object storage
- State Management: MongoDB Atlas or similar database service
- Environment Variables: Cloud platform specific configuration

### Local Development

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/rickicode/NexusDrop.git
   cd NexusDrop
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Run the Server:**

   Start the server by running:

   ```bash
   node server.js
   ```

   The server will start on port `3001` by default.

4. **Access the Application:**

   Open your browser and navigate to:
   
   ```url
   http://localhost:3001
   ```

## Usage

1. **Enter a URL:** On the homepage, input the URL of the file you want to download.
   
2. **Set Expiration Time:** Choose how long the download link should be available (from 1 hour to 3 days).

3. **Start Download:** Click the Download button. The server will transform the URL to a mirror version using `https://get.0ms.dev`, initiate the download, and display progress.

4. **Monitor Downloads:** The page will display active downloads along with their statuses. Completed downloads will be available under the "Downloads" section.

## Application Purpose

NexusDrop was created to simplify and accelerate the process of downloading files over slow or unreliable internet connections. By leveraging powerful mirror servers, it ensures users can access their files faster and with a better overall experience. This application is ideal for handling large files, streaming transfers, or situations where traditional direct downloads might lag.

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License.
