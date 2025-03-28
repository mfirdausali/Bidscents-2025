import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 pt-12 pb-8">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <Link href="/" className="text-2xl font-playfair font-bold text-rich-black mb-4 inline-block">
              <span className="text-gold">E</span>ssence
            </Link>
            <p className="text-gray-600 mb-4">
              The premier marketplace for luxury fragrances, connecting perfume enthusiasts with exceptional scents.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-gold transition">
                <i className="fab fa-facebook-f"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-gold transition">
                <i className="fab fa-instagram"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-gold transition">
                <i className="fab fa-twitter"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-gold transition">
                <i className="fab fa-pinterest"></i>
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="font-playfair font-semibold text-lg mb-4">Customer Service</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Contact Us</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">FAQ</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Shipping & Returns</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Track Order</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Gift Cards</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-playfair font-semibold text-lg mb-4">Information</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-600 hover:text-gold transition">About Us</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Fragrance Guide</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Sustainability</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Careers</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Press</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-playfair font-semibold text-lg mb-4">Selling on Essence</h3>
            <ul className="space-y-2">
              <li><Link href="/seller/dashboard" className="text-gray-600 hover:text-gold transition">Seller Dashboard</Link></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Seller Guidelines</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Success Stories</a></li>
              <li><a href="#" className="text-gray-600 hover:text-gold transition">Seller Support</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-200 mt-10 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-gray-500 text-sm mb-4 md:mb-0">
              &copy; 2023 Essence. All rights reserved.
            </div>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-500 text-sm hover:text-gold transition">Privacy Policy</a>
              <a href="#" className="text-gray-500 text-sm hover:text-gold transition">Terms of Service</a>
              <a href="#" className="text-gray-500 text-sm hover:text-gold transition">Cookies</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
