import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="container mx-auto px-6 py-10 flex-grow">
        <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-100">
          <h1 className="text-3xl font-bold mb-6 text-gray-900">
            Terms of Service
          </h1>

          <div className="prose prose-sm max-w-none text-gray-700">
            <p className="mb-4">
              Welcome to BidScents, an online marketplace for buying, selling,
              and bidding on preowned fragrances. By accessing or using our
              website and services (the "Platform"), you agree to be bound by
              the following terms and conditions ("Terms"). Please read them
              carefully before using the Platform.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              1. General Overview
            </h2>
            <p>
              BidScents is a platform that facilitates peer-to-peer transactions
              between individual buyers and sellers of fragrances. The Platform
              enables users to list, buy, and bid on preowned perfumes through
              direct sales or time-limited auctions.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              2. User Responsibilities
            </h2>
            <p>By using BidScents, you agree that:</p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>
                You are at least 16 years old or have permission from a legal
                guardian.
              </li>
              <li>All information you provide is accurate and up to date.</li>
              <li>
                You will not engage in any illegal, abusive, or fraudulent
                activity on the platform.
              </li>
              <li>You are responsible for all activity under your account.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              3. Listings & Transactions
            </h2>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>
                All listings must be truthful and accurately represent the
                condition, authenticity, and details of the fragrance.
              </li>
              <li>
                BidScents does not guarantee the accuracy of any listing or the
                quality/authenticity of any product.
              </li>
              <li>
                Users are solely responsible for their decision to buy, sell, or
                bid on any item.
              </li>
            </ul>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              4. Shipping and Delivery
            </h2>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>
                Sellers are responsible for shipping the items in a timely and
                secure manner.
              </li>
              <li>
                BidScents does not guarantee the delivery or condition of items
                shipped.
              </li>
              <li>
                Buyers are encouraged to communicate with sellers and confirm
                shipment details through our messaging system.
              </li>
              <li>
                Disputes regarding undelivered or damaged goods must be resolved
                between the buyer and the seller. We may assist but are not
                liable for the outcome.
              </li>
            </ul>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              5. Auctions and Bidding
            </h2>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>All bids placed are final and binding.</li>
              <li>
                If you win an auction, you are legally obligated to complete the
                purchase within the stated payment window.
              </li>
              <li>
                If you fail to pay, your account may be suspended or banned.
              </li>
            </ul>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              6. Buyer Protection and Escrow
            </h2>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>
                In some cases, BidScents may offer escrow services to hold funds
                until delivery is confirmed.
              </li>
              <li>
                However, BidScents does not guarantee refunds, replacements, or
                delivery of items.
              </li>
              <li>
                Disputes may be reviewed by our team, but BidScents does not
                accept liability for the resolution or outcome.
              </li>
            </ul>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              7. Limitation of Liability
            </h2>
            <p>
              BidScents, its founders, partners, and affiliates shall not be
              held liable for any:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>
                Financial loss incurred due to transaction disputes, failed
                shipments, scams, or fraud.
              </li>
              <li>
                Lost, stolen, damaged, or misrepresented products sold on the
                platform.
              </li>
              <li>Errors, delays, or service interruptions on the Platform.</li>
              <li>
                Any indirect, incidental, or consequential damages arising from
                use of the Platform.
              </li>
            </ul>
            <p>
              You agree that you are using BidScents at your own risk, and you
              understand that BidScents acts only as a facilitator and not a
              party to any transaction.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              8. Prohibited Items and Activity
            </h2>
            <p>You may not list, sell, or promote:</p>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Counterfeit or fake perfumes.</li>
              <li>Fragrances containing illegal or hazardous substances.</li>
              <li>Fraudulent listings or spam.</li>
              <li>Any content that violates local or international laws.</li>
            </ul>
            <p>
              Violation of these policies may result in account termination or
              legal action.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              9. Account Termination
            </h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate
              these terms, engage in fraudulent behavior, or disrupt the
              community. In such cases, any pending earnings or unresolved
              disputes may be withheld at our discretion.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              10. Intellectual Property
            </h2>
            <p>
              All content on the Platform including the BidScents name, logo,
              design, and software code is protected by copyright and
              intellectual property laws. You may not reproduce, duplicate, or
              exploit any part of the Platform without written permission.
            </p>

            <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
              11. Modifications to Terms
            </h2>
            <p>
              BidScents reserves the right to modify or update these Terms at
              any time. Users will be notified of changes, and continued use of
              the Platform after changes are posted will constitute acceptance
              of those changes.
            </p>

            <div className="mt-8 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Last Updated: 14 April 2025
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
