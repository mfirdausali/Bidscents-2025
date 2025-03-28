# **Product Requirements Document (PRD)**

# **BidLelongMY: Pre-owned Perfume Marketplace**

## **Document Information**  **Last Updated:** March 21, 2025  **Version:** 1.0

## **Executive Summary**

BidLelongMY is a specialized online marketplace designed for buying, selling, and auctioning pre-owned perfumes in Malaysia. The platform features authentication services, escrow payments, and a community for fragrance enthusiasts. This PRD outlines the key requirements and specifications for developing the BidLelongMY platform.

## **Business Objectives**

1. Create Malaysia's premier marketplace for authentic pre-owned perfumes  
2. Establish a secure and trustworthy platform for perfume transactions  
3. Build a community of fragrance enthusiasts  
4. Generate revenue through transaction fees and premium listing options  
5. Achieve market penetration of at least 30% among perfume enthusiasts within 12 months

## **Target Users**

### **Sellers**

* Individual collectors looking to declutter their collections  
* Fragrance enthusiasts who frequently rotate their collections  
* Small businesses specializing in perfume resale

### **Buyers**

* Fragrance enthusiasts seeking discontinued or limited-edition perfumes  
* Value-conscious consumers looking for discounted premium fragrances  
* Collectors seeking rare items

## **Core Features and Requirements**

### **1\. User Registration & Authentication**

#### **1.1 User Sign-Up**

* **Priority:** High  
* **Description:** Allow users to create an account using email, phone number, or social media accounts  
* **Requirements:**  
  * Collect basic information: name, email, phone number, location  
  * Implement OTP verification for email  
  * Integrate social login options (Google, Facebook, Apple)  
  * Accept terms of service and privacy policy  
  * Create user profile upon successful registration

#### **1.2 Seller Verification**

* **Priority:** High  
* **Description:** Implement KYC (Know Your Customer) process for sellers to ensure platform integrity  
* **Requirements (Subject to discussion):**  
  * Ada vouching system untuk dapat badge ‘trusted’  
  * Find out escrow provider  
  * Implement address verification process  
  * Set up verification badges for verified sellers  
  * Create dashboard for admin review of verification documents  
  * Create seller dashboard

#### **1.3 User Profiles**

* **Priority:** Medium  
* **Description:** Allow users to create and manage their profiles  
* **Requirements:**  
  * Profile information (name, bio, location (untuk orang cod), profile picture)  
  * Seller/buyer statistics (items sold/purchased, average rating)  
  * Transaction history  
  * Saved/favorite items  
  * Follow/unfollow other users

### **2\. Perfume Listing Management**

#### **2.1 Create Listing**

* **Priority:** High  
* **Description:** Allow sellers to create detailed perfume listings  
* **Requirements:**  
  * Multiple image upload (minimum 3, maximum 10 images)  
  * Required fields: brand, name, size, batch code, purchase year, condition (% remaining)  
  * Optional fields: box condition, fragrance notes, reason for selling  
  * Price setting options (fixed, negotiable, auction)  
  * Premium listing options (featured, highlighted, etc.) \- boosting  
  * Draft saving functionality

#### **2.2 Batch Code Verification**

* **Priority:** Low  
* **Description:** Implement system to verify perfume authenticity through batch codes  
* **Requirements:**  
  * Batch code input field  
  * Integration with batch code verification databases  
  * Visual indicators for verified batch codes  
  * Report functionality for suspicious batch codes

#### **2.3 Listing Management**

- Algorithm:   
- Use point system  
- Boosted (++ points)  
- Favourite (+ points)  
- The rest would be displayed according to time.

* **Priority:** High  
* **Description:** Allow sellers to manage their active listings  
* **Requirements:**  
  * Edit listing details  
  * Mark as sold/unsold  
  * Cancel listings  
  * Boost listing visibility (paid feature)  
  * View listing statistics (views, saves/favorite, inquiries)

### **3\. Browse and Search Functionality**

#### **3.1 Search System**

* **Priority:** High  
* **Description:** Implement comprehensive search functionality  
* **Requirements:**  
  * Basic search with text input  
  * Advanced filters (brand, type, price range, condition, etc.)  
  * Sort options (price high/low, newest, most popular)  
  * Save search preferences  
  * Search history tracking

#### 

#### **3.2 Category Navigation**

* **Priority:** Medium  
* **Description:** Organize perfumes into browsable categories  
* **Requirements:**  
  * Main categories (Niche, Designer, Local & Arab)  
  * Sellers tag their listings

#### **3.3 AI Recommendations**

* **Priority:** Low (Phase 2\)  
* **Description:** Implement an AI system to recommend perfumes based on user preferences   
* **Requirements:**  
  * Collect user preferences through initial questionnaire  
  * Track browsing and purchase behavior  
  * Generate personalized recommendations  
  * "Similar items" functionality  
  * "People who bought this also bought" feature  
* Maybe boleh consider outsourcing pada Fragrantica juga

### **4\. Transaction Processing**

#### **4.1 Payment System (Billplz) for boosting (confirmed)**

* **Priority:** High  
* **Description:** Implement secure escrow payment system to protect buyers and sellers  
* **Requirements:**  
  * Integration with payment gateways (local and international)  
  * Hold funds until buyer confirms authenticity and receipt  
  * Automated release process after confirmation period  
  * Dispute resolution process  
  * Refund mechanism  
  * Transaction fee calculation and transparency  
  * For escrow, consider using third party  
  * Cadangan FY: 1.5% \+ RM1.3 (untuk cover bilplz cost) \=\> in this case kita pass all the cost pada buyer  
  * As for now COD kita buat P2P shj

#### **4.2 In-app Messaging**

* **Priority:** High  
* **Description:** Enable secure communication between buyers and sellers  
* **Requirements:**  
  * Thread-based conversations tied to listings  
  * Rich text messaging with image sharing  
  * Message notification system  
  * Read receipts  
  * Blocked user management  
  * Profanity filter and content moderation

#### **4.2.1 Negotiation System (chatbox)**

* **Priority:** High  
* **Description:** Enable buyers and sellers to negotiate prices  
* **Requirements:**  
  * Make offer functionality with counter-offer option  
  * In-app messaging for price discussion  
  * Offer expiration settings  
  * Accept/reject offer mechanisms  
  * Binding agreement upon acceptance  
  * Chatbox implementation (buat macam Facebook marketplace)  
  * Buyer buat offer, seller accept, terus masuk chatbox

#### **4.3 Bidding System**

* **Priority:** Very High (due to its nature being key feature)  
* **Description:** Implement auction functionality for sellers who prefer bidding  
* **Requirements:**  
  * Set minimum starting bid and reserve price  
  * Use websockets for real time bids  
  * Penalty/ban for joy bidder  
  * Rating system for buyer  
  * 36-hour auction duration  
  * Minimum bid increment of RM5  
  * Automatic extension for last-minute bids (5 minutes)  
  * Bid history tracking  
  * Outbid notifications  
  * Automated winner notification  
  * Non-paying bidder penalty system

### **5\. Shipping and Delivery**

#### **5.1 Shipping Integration**

* **Priority:** Medium (lepas tangan \- sebab taknak ambil risk lagi as for now)  
* **Description:** Integrate with shipping providers for streamlined delivery process  
* **Requirements:**  
  * Integration with major Malaysian shipping providers  
  * Shipping cost calculator  
  * Shipping label generation  
  * Address validation  
  * Package size and weight specification  
  * Insurance options  
  * Time limit: 48 hours (we update SOP supaya ada assurance)

#### **5.2 Tracking System**

* **Priority:** Medium (lepas tangan, tapi cater thru ticket)  
* **Description:** Provide real-time tracking for both buyers and sellers  
* **Requirements:**  
  * Tracking number input and validation  
  * Real-time tracking status updates  
  * Delivery confirmation mechanism  
  * Notification system for status changes  
  * Handling for lost packages

### **6\. Communication and Messaging**

#### **6.2 Notification System**

* **Priority:** Medium  
* **Description:** Keep users informed about relevant activities  
* **Requirements:**  
  * Push notifications (mobile app)  
  * Email notifications  
  * In-app notification center  
    * Kalau buyer favourite dia punya posting  
  * Notification preferences management  
  * Transaction-related alerts (payment received, item shipped)  
  * System announcements

### **7\. Community Features**

#### **7.1 Reviews and Ratings (vouching system) \=\> cdgn Zaim: separated dengan user onboarding**

* **Priority:** High  
* **Description:** Enable users to rate and review each other after transactions  
* **Requirements:**  
  * Star rating system (1-5 stars)  
  * Written review component  
  * Photo upload option for reviews  
  * Dispute mechanism for unfair reviews (dari dispute submission shgga dispute settlement)  
    * App untuk raise ticket  
    * Conversations thru email  
  * Seller and buyer specific ratings  
  * Overall reputation score calculation

#### **7.2 Discussion Forums**

* **Priority:** Low (Phase 2\)  
* **Description:** Create community space for fragrance discussions  
* **Requirements:**  
  * Category-based forums  
  * Thread creation and response  
  * Moderation tools  
  * Image sharing capabilities  
  * Upvote/downvote system  
  * Tagging and search functionality

#### **7.3 Referral System**

* **Priority:** Low  
* **Description:** Implement referral program to encourage user acquisition  
* **Requirements:**  
  * Unique referral codes for each user  
  * Reward structure for successful referrals  
  * Tracking for referral performance  
  * Fraud prevention mechanisms  
  * Referral dashboard for users

### **8\. Admin and Moderation**

#### **8.1 Admin Dashboard**

* **Priority:** High  
* **Description:** Create comprehensive admin interface for platform management  
* **Requirements:**  
  * User management (view, suspend, ban)  
  * Listing moderation (approve je semua, kalau ada flag baru remove)  
  * Transaction monitoring (orang raise ticket kalau tak bayar)  
  * Dispute resolution tools  
  * Analytics and reporting  
  * Content management system

#### **8.2 Authenticity Verification**

* **Priority:** Medium  
* **Description:** Implement processes to verify perfume authenticity  
* **Requirements:**  
  * Batch code verification system  
  * Suspicious listing flags and review process  
  * Expert authentication option for high-value items  
  * Appeal process for rejected listings  
  * Educational content about spotting fakes

#### **8.3 Reporting System**

* **Priority:** Medium  
* **Description:** Allow users to report suspicious listings or behavior  
* **Requirements:**  
  * Report categories (counterfeit, prohibited item, harassment)  
  * Evidence upload capability  
  * Status tracking for reports  
  * Automatic flagging for repeated reports  
  * Response mechanism from admin

## **Technical Requirements**

### **1\. Platform Architecture**

* Web application (responsive design)  
* Native mobile applications (iOS and Android)  
* API-first approach for service integration  
* Cloud-based infrastructure with high availability  
* Microservices architecture for scalability

### **2\. Security Requirements**

* End-to-end encryption for messaging  
* Secure payment processing (PCI DSS compliance)  
* Data protection measures (PDPA compliance)  
* Regular security audits and penetration testing  
* Fraud detection systems

### **3\. Performance Requirements**

* Page load time \< 3 seconds  
* Search response time \< 1 second  
* 99.9% uptime  
* Support for concurrent users (initial target: 5,000)  
* Efficient image processing and storage

### **4\. Integration Requirements**

* Payment gateways (FPX, credit cards, e-wallets)  
* Shipping providers API integration  
* Social media integrations  
* Email service provider  
* SMS gateway for notifications  
* Analytics platform

## **Phase Implementation Plan**

### **Phase 1 (MVP \- Launch within 3 months)**

* User registration and verification  
* Basic listing creation and management  
* Search and filter functionality  
* Escrow payment system  
* In-app messaging  
* Shipping and tracking integration  
* Admin dashboard (basic)

### **Phase 2 (3-6 months post-launch)**

* Bidding system  
* Enhanced search with AI recommendations  
* Discussion forums  
* Mobile applications  
* Referral system  
* Advanced analytics  
* Expanded payment options

### **Phase 3 (6-12 months post-launch)**

* International shipping options  
* Advanced fraud detection  
* API for third-party integration  
* Enhanced community features  
* White-label solutions for businesses  
* Subscription-based premium features

## **Success Metrics**

* User acquisition: 10,000 registered users within 3 months  
* Retention: 50% monthly active user rate  
* Transaction volume: 1,000 transactions per month by month 6  
* Revenue: Break-even by month 12  
* User satisfaction: 4.5/5 average platform rating

## **Risks and Mitigation Strategies**

1. **Counterfeit products**  
   * Mitigation: Robust authentication system, seller verification, escrow payment  
2. **Low user adoption**  
   * Mitigation: Strategic marketing, incentives for early adopters, referral program  
3. **Payment fraud**  
   * Mitigation: Secure payment gateway, transaction monitoring, suspicious activity alerts  
4. **Platform security breaches**  
   * Mitigation: Regular security audits, encrypted data storage, secure coding practices  
5. **Competition from general marketplaces**  
   * Mitigation: Focus on specialized features for perfume enthusiasts, community building

**Revenue generation:**

- Boosting service  
- Ads  
- Escrow usage

Meeting minute 23/3/2025

- Finish the remaining PRD  
- Finalize content on the PRD, mana yang stay and mana yang should go. We will tick every individual mini point under each segment. After that baru boleh move to another segment.  
- Learn how to implement bidding system  
- Think where to implement p2p, as for vinted they use escrow all the time  
- Need to have at least some development before the meeting with the group admins as a demo for them. If dah commit and nampak ada progress barulah dorang macam okay nak support 