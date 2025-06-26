# Bidscents-MFA Project Overview

This document provides a high-level overview of the Bidscents-MFA project, its structure, and how to get it running.

## Project Description

Bidscents-MFA is a full-stack application for a real-time auction platform. It features a React-based frontend, a Node.js (Express) backend, and leverages Supabase for database, authentication, and storage services. The system is designed to handle the complete lifecycle of an auction, from product creation by sellers to live bidding by users, and includes a real-time messaging system for post-auction communication.

## Key Technologies

-   **Frontend:** React, TypeScript, Vite, Tailwind CSS, Shadcn UI
-   **Backend:** Node.js, Express, TypeScript, tsx
-   **Database:** PostgreSQL (via Supabase)
-   **ORM:** Drizzle ORM
-   **Authentication:** Supabase Auth
-   **Real-time:** WebSockets (`ws` library)
-   **Storage:** Supabase Storage

## Getting Started

### Prerequisites

-   Node.js (v20.x or later recommended)
-   `npm` package manager
-   A Supabase project for database, auth, and storage.

### Installation

1.  Clone the repository.
2.  Create a `.env` file by copying the `.env.example` file and populate it with your Supabase project credentials and other required environment variables.
3.  Install the project dependencies:
    ```bash
    npm install
    ```

### Development

To run the application in development mode (with hot-reloading for both server and client), use the following command:

```bash
npm run dev
```

This command uses `tsx` to run the Express server and Vite to serve the React frontend.

### Database Migrations

The project uses Drizzle ORM for database schema management. To push schema changes from your Drizzle schema definitions (`shared/schema.ts`) to your Supabase database, run:

```bash
npm run db:push
```

### Building for Production

To create a production-ready build of the application, run:

```bash
npm run build
```

This command will first build the React frontend using Vite, then build the Node.js server using `esbuild`. The output will be placed in the `dist/` directory.

### Starting the Production Server

After building the project, you can start the production server with:

```bash
npm run start
```

## Project Structure

```
/
├── client/         # React frontend application
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── hooks/      # Custom React hooks
│   │   ├── lib/        # Utility functions, Supabase client
│   │   └── pages/      # Page components for different routes
│   └── index.html      # Entry point for the frontend
├── server/         # Node.js/Express backend
│   ├── routes/       # API route definitions
│   ├── websockets/   # WebSocket handlers for real-time features
│   ├── jobs/         # Background jobs (e.g., auction closing)
│   ├── db.ts         # Database connection setup
│   └── index.ts      # Main server entry point
├── shared/         # Code shared between frontend and backend
│   └── schema.ts     # Drizzle ORM schema definitions
├── scripts/        # Standalone scripts for various tasks
├── drizzle.config.ts # Configuration for Drizzle Kit
├── package.json      # Project dependencies and scripts
└── tsconfig.json     # TypeScript configuration
```
