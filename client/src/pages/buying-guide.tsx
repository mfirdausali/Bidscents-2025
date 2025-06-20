
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";

export default function BuyingGuidePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="container mx-auto px-6 py-10 flex-grow">
        <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-100">
          <h1 className="text-3xl font-bold mb-6 text-purple-600">
            🛒 Buying Guide – How to Purchase Safely on BidScents
          </h1>

          <div className="prose prose-sm max-w-none text-gray-700">
            <p className="mb-6">
              Welcome to BidScents, your trusted preowned perfume marketplace! Whether you're a beginner or a seasoned collector, follow this step-by-step guide to make your purchase safe, smooth, and enjoyable.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              ✅ Step 1: Browse & Choose Your Fragrance
            </h2>
            <p>
              Explore our wide range of designer, niche, local house, and Arabian perfumes.
              When you find a scent you like, click on the listing to view details such as:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>Condition (New/Used)</li>
              <li>Volume remaining</li>
              <li>Original packaging</li>
              <li>Seller location and reviews</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              🔍 Step 2: Check Authenticity
            </h2>
            <p>
              We take counterfeit prevention seriously. Before proceeding:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>Carefully inspect all images uploaded by the seller</li>
              <li>Look for signs of authenticity (batch code, packaging, etc.)</li>
              <li>If something looks suspicious, report the listing to admin using the "Report" button. We'll take action immediately.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              💬 Step 3: Contact the Seller
            </h2>
            <p>
              If the perfume looks legit and you're happy with the price:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>Use our secure chat system to message the seller</li>
              <li>Ask for extra pictures, receipt/proof of purchase, or a video if needed</li>
              <li>Clarify any concerns before agreeing to buy</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              💸 Step 4: Complete the Transaction
            </h2>
            <p>
              Once you're satisfied:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>Agree on payment method in the chat</li>
              <li>Send your proof of payment and shipping details (full name, address, phone number)</li>
              <li>The seller will then process and ship your item</li>
            </ul>
            <p className="text-amber-600 font-medium">
              ⚠️ Never share sensitive information like bank login or OTPs. Stay within the chat for security.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              ⭐ Step 5: Confirm & Rate the Seller
            </h2>
            <p>
              After receiving your perfume:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>Confirm that everything is in good condition</li>
              <li>Leave a rating and review to help others make informed decisions</li>
              <li>Your feedback builds trust in our community</li>
            </ul>

            <div className="bg-purple-50 p-4 rounded-lg mt-8 mb-12">
              <h2 className="text-xl font-semibold mb-2 text-purple-800">
                🔒 Coming Soon: Buyer Protection & Escrow
              </h2>
              <p className="text-purple-700">
                We're working hard to introduce Buyer Protection and an Escrow Service to ensure you can shop with total peace of mind.
              </p>
            </div>

            <h2 className="text-2xl font-bold mt-16 mb-6 text-gray-800">
              📊 Seller Dashboard – Manage Your Perfume Listings with Ease
            </h2>
            <p className="mb-6">
              The Seller Dashboard is your personal hub to manage everything related to your listings on BidScents. Whether you're selling one bottle or building a side hustle, we make it simple and efficient.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              📦 View All Your Listings in One Place
            </h3>
            <p>
              Access your entire perfume inventory from the dashboard:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>See what's currently live</li>
              <li>Track which items are sold or still available</li>
            </ul>

            <h3 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              ✏️ Edit or Remove Listings Anytime
            </h3>
            <p>
              Need to make changes? You're in control.
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>Edit your listings to update price, photos, or description</li>
              <li>Delete items that are no longer available or sold outside the platform</li>
              <li>Keep your profile professional and up-to-date</li>
            </ul>

            <h3 className="text-xl font-semibold mt-8 mb-4 text-gray-800">
              🚀 Boost Visibility with Featured Listings
            </h3>
            <p>
              Want to reach more buyers? Try our Featured Listing service!
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2 mt-2">
              <li>Your product will appear higher in search results</li>
              <li>Get increased exposure across homepage sections</li>
              <li>Attract serious buyers faster</li>
            </ul>
            <p>Coming soon: analytics tools to show how your listings are performing!</p>

            <div className="bg-amber-50 p-4 rounded-lg mt-8">
              <h3 className="text-xl font-semibold mb-2 text-amber-800">
                📌 Quick Tips for Sellers
              </h3>
              <ul className="list-disc pl-5 space-y-2 text-amber-700">
                <li>Use clear, high-quality photos</li>
                <li>Be honest about perfume condition and volume</li>
                <li>Respond promptly to interested buyers</li>
                <li>Ship quickly after receiving payment to earn great reviews</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
