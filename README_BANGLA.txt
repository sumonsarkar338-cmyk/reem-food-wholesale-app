Quick Refuel / B2B Wholesale Distribution App (Local Laptop Edition)
=====================================================================

এই app টি internet ছাড়া একই laptop/browser এ চালানো যাবে।

কিভাবে চালাবেন
----------------
1. ZIP file extract করুন।
2. b2b_wholesale_app folder-এর index.html file-এ double click করুন।
3. একই laptop-এর একই browser (Chrome/Edge) দিয়ে পরে আবার index.html খুললে আগের data automatically থাকবে।

Data কোথায় থাকে
---------------
- সব data আপনার laptop-এর browser local storage-এ automatically save হয়।
- App বন্ধ করে পরে খুললেও data থাকবে।
- Browser-এর Clear Browsing Data / Clear Site Data দিলে data মুছে যেতে পারে।
- অন্য browser বা অন্য laptop-এ একই data automatically দেখা যাবে না।
- নিয়মিত Administration > Local Data Storage থেকে Backup JSON download রাখুন।

বর্তমান আপডেট
-------------
1. Sidebar-এর একদম নিচে Log out button যোগ করা হয়েছে।
2. Top-right-এ শুধু বর্তমানে login করা user-এর নাম দেখাবে।
3. Password login এখনো চালু করা হয়নি। সব business update শেষ হলে password login করা হবে।
4. VAT Status, VAT Rate, VAT Number Company Details-এ রাখা যায়। এগুলো এখন invoice/sales calculation পরিবর্তন করবে না।
5. Cash বা Bank sale customer due account-এ যাবে না। শুধু Due/Partial sale-এর বাকি amount customer due-তে যোগ হবে।
6. Customer payment total customer due থেকে কমবে; invoice select করার দরকার হবে না।
7. Sales return, purchase return এবং payment return-এ Available Return Qty/Amount দেখাবে। আগের return + pending return বাদ দিয়ে বেশি return দেওয়া যাবে না।
8. Purchase return-এ Warehouse-এর available stock-ও দেখা যাবে।
9. Company Name, address, phone, email, CR number, VAT details, main warehouse details শুধু Owner/Admin account থেকে পরিবর্তন করা যাবে।
10. Company detail app branding এবং future invoice view-তে update হবে।

গুরুত্বপূর্ণ
-----------
- এই version local/offline ব্যবহার করার জন্য।
- একই সময়ে অনেক laptop/mobile থেকে live ব্যবহার করতে চাইলে পরে online database + secure login system লাগবে।

Settlement ব্যবহার
------------------
1. Owner/Admin login করুন।
2. Sidebar থেকে Settlement Report খুলুন।
3. Generate Settlement চাপুন।
4. Sub Branch এবং From/To Date নির্বাচন করুন।
5. Generate Draft Preview চাপুন।
6. Customer sales/collection, expenses, main-branch transfer, branch purchase, stock এবং cash summary মিলিয়ে দেখুন।
7. সব ঠিক থাকলে Confirm & Lock Settlement চাপুন।

Lock করার পরে ওই branch-এর ওই date range-এ নতুন operational entry দেওয়া যাবে না। ভুল ধরা পড়লে Settlement Register থেকে Reopen চাপুন, কারণ লিখুন, correction করুন, তারপর নতুন settlement version তৈরি করুন।

====================================================
LATEST UPDATE (v4): Premium UI, Menu & Role Structure
====================================================
Premium dashboard design, the requested menu order, Admin/Manager/Salesman roles, Manager permission checkboxes, dedicated Salesman branch sidebar, Transfer workspace and Return & Damage workspace have been added.

Details: UPDATE_NOTES_BANGLA.txt
