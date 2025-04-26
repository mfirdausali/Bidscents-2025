
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="container mx-auto px-6 py-10 flex-grow">
        <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-100">
          <h1 className="text-3xl font-bold mb-6 text-gray-900">
            Privacy Policy
          </h1>

          <div className="prose prose-sm max-w-none text-gray-700">
            <p className="mb-4">
              At BidScents, accessible at www.bidscents.com, we take your privacy seriously. 
              This Privacy Policy outlines how we collect, use, store, and protect your personal 
              data in accordance with applicable data protection laws. By using our website, 
              you agree to the terms outlined below.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              🔐 1. Information We Collect
            </h2>
            <p>We collect the following types of data:</p>
            <p><strong>a. Account Information:</strong></p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Name</li>
              <li>Email address</li>
              <li>Username</li>
              <li>Password (hashed and encrypted)</li>
              <li>Phone number (if provided)</li>
            </ul>
            <p><strong>b. Transaction & Listing Data:</strong></p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Product listings, bids, watchlists, purchase history</li>
              <li>Payment status (no card details are stored on our servers)</li>
              <li>Communication history with other users</li>
            </ul>
            <p><strong>c. Technical Data:</strong></p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device type</li>
              <li>Operating system</li>
              <li>Log data and usage patterns (for analytics and improvements)</li>
            </ul>
            <p><strong>d. Cookies & Tracking:</strong></p>
            <p>We use cookies and similar technologies for user authentication, improving user experience, and analytics.</p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              ✅ 2. How We Use Your Data
            </h2>
            <p>We use your personal data for the following purposes:</p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>To create and manage your user account</li>
              <li>To facilitate transactions, including bidding and purchases</li>
              <li>To provide customer support and resolve disputes</li>
              <li>To send you notifications related to your activity on the platform</li>
              <li>To improve our services and personalize user experience</li>
              <li>To comply with legal obligations</li>
            </ul>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              🚫 3. No Selling of User Data
            </h2>
            <p>
              BidScents does not sell, rent, or trade your personal information to third parties. 
              Any data sharing is limited to services required to operate the platform 
              (e.g., payment processing, analytics, fraud protection).
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              🧾 4. Data Retention
            </h2>
            <p>
              We retain your data for as long as your account is active or as necessary for legitimate 
              business purposes. If you delete your account, your personal information will be 
              permanently removed from our active systems within 14 days, unless legally required to retain it.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              🗑 5. Your Data Rights
            </h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate or incomplete data</li>
              <li>Request deletion of your account and data</li>
              <li>Request a copy of your data in a portable format</li>
              <li>Withdraw consent for data processing (where applicable)</li>
            </ul>
            <p>
              To make a request, please email us at admin@bidscents.com with the subject "Data Request".
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              🧠 6. User Account & Deletion
            </h2>
            <p>Users can view, update, or delete their data anytime by:</p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Logging into your account and accessing the Account Settings page</li>
              <li>Clicking "Delete My Account" to permanently erase your data</li>
              <li>Or emailing admin@bidscents.com for manual removal requests</li>
            </ul>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              🔒 7. Data Security
            </h2>
            <p>We use industry-standard security measures to protect your data, including:</p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>HTTPS (SSL) encryption</li>
              <li>Password hashing</li>
              <li>Two-factor authentication (coming soon)</li>
              <li>Role-based access controls</li>
              <li>Encrypted storage of sensitive user data</li>
            </ul>
            <p>
              Despite our efforts, no online transmission or storage method is 100% secure. 
              We encourage you to protect your own account with strong passwords and secure devices.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              🌍 8. Third-Party Services
            </h2>
            <p>We may use trusted third-party providers such as:</p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Stripe / Payex / SenangPay for payment processing</li>
              <li>Firebase / Supabase for authentication and database services</li>
              <li>Google Analytics / Meta Pixel for understanding user behavior</li>
            </ul>
            <p>Each third-party service has its own privacy policy.</p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              📱 9. Facebook & Third-Party Login
            </h2>
            <p>
              If you choose to log in via Facebook, we only request essential permissions 
              (e.g., email address, name). No posting will be made without your explicit consent. 
              You can revoke access at any time via your Facebook account settings.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              📝 10. Changes to This Policy
            </h2>
            <p>
              We may update this policy from time to time. Any major changes will be communicated 
              via email or notification on our website. The updated policy will always be 
              available at www.bidscents.com/privacy-policy.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              📬 11. Contact Us
            </h2>
            <p>
              If you have any questions or concerns about this Privacy Policy, or if you'd like 
              to delete or access your data, contact us at:
            </p>
            <p>
              BidScents Support<br />
              Email: admin@bidscents.com<br />
              Website: www.bidscents.com
            </p>

            <div className="mt-8 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Last Updated: April 14, 2025
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
