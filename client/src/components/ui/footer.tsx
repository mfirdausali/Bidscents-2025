import { Link } from "wouter";
import {
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 pt-12 pb-8">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <Link
              href="/"
              className="text-xl font-bold text-gray-900 mb-4 inline-block"
            >
              <span className="text-purple-600">Bid</span>
              <span className="text-amber-500">Scents</span>
            </Link>
            <p className="text-gray-600 mb-4 text-sm">
              The premier marketplace for secondhand perfumes, connecting
              fragrance enthusiasts in Malaysia since 2025.
            </p>
            <div className="flex space-x-4 mt-6">
              <a
                href="#"
                className="bg-gray-100 p-2 rounded-full text-gray-600 hover:bg-purple-100 hover:text-purple-600 transition-colors"
              >
                <Facebook size={18} />
              </a>
              <a
                href="#"
                className="bg-gray-100 p-2 rounded-full text-gray-600 hover:bg-purple-100 hover:text-purple-600 transition-colors"
              >
                <Instagram size={18} />
              </a>
              <a
                href="#"
                className="bg-gray-100 p-2 rounded-full text-gray-600 hover:bg-purple-100 hover:text-purple-600 transition-colors"
              >
                <Twitter size={18} />
              </a>
              <a
                href="#"
                className="bg-gray-100 p-2 rounded-full text-gray-600 hover:bg-purple-100 hover:text-purple-600 transition-colors"
              >
                <Linkedin size={18} />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-base mb-4 text-gray-900">
              Quick Links
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  Blog
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  FAQs
                </a>
              </li>
              <li></li>
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  Help Center
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-base mb-4 text-gray-900">
              For Buyers & Sellers
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  Buying Guide
                </a>
              </li>
              <li>
                <Link
                  href="/seller/dashboard"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  Seller Dashboard
                </Link>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  Authentication Process
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  Shipping Guidelines
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-gray-600 hover:text-purple-600 transition-colors"
                >
                  Return Policy
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-base mb-4 text-gray-900">
              Contact Us
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center">
                <Mail size={16} className="text-purple-600 mr-2" />
                <span className="text-gray-600">admin@bidscents.com</span>
              </li>
              <li className="flex items-start">
                <MapPin size={16} className="text-purple-600 mr-2 mt-0.5" />
                <span className="text-gray-600">Kuala Lumpur, Malaysia</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 mt-10 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-gray-500 text-xs mb-4 md:mb-0">
              &copy; 2025 BidScents. All rights reserved.
            </div>
            <div className="flex flex-wrap justify-center space-x-4">
              <Link
                href="/terms-of-service"
                className="text-gray-500 text-xs hover:text-purple-600 transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}