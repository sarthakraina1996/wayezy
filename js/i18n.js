/* ============================================================
   LANGUAGE: English and Hindi (हिन्दी) for everything a visitor sees - menus, store cards, the map's labels,
   directions and the voice. Brand names (and "Wayezy", and the venue's name) stay as they are.

   The Hindi follows the house guide: natural modern standard Hindi as spoken in Indian malls, the respectful आप
   with its imperative (-इए) forms, which read the same for every visitor, gender-neutral wording wherever the
   visitor's gender would change the words ("आपकी मंज़िल आ गई है" rather than "आप पहुँच गए/गई"), the loanwords
   Indians actually use (स्टोर, ऑफ़र, मैप, लिफ्ट, एस्केलेटर) and plain signage words (प्रवेश, निकास, शौचालय).
   Turn-by-turn directions are built in Hindi by the engine itself (engine.js directions(), lang:'hi').

   T('English text', {vars})  interface text        tc('text')  sample content (offers, events...)
   tr('text')                 names from the floor plans (floors, categories, toilets, lifts, areas)
   ============================================================ */
/* the language a kiosk returns to for each new visitor (?lang=hi makes Hindi the default); the phone remembers the visitor's choice */
const KIOSK_LANG=QS.get('lang')==='hi'?'hi':'en';
let LANG=KIOSK_LANG;
const LANGS={en:'English',hi:'हिन्दी'};
const HI={
  // map, floors, labels
  'Ground floor':'ग्राउंड फ़्लोर','First floor':'पहली मंज़िल','Second floor':'दूसरी मंज़िल','Ground':'ग्राउंड','First':'पहली','Second':'दूसरी',
  'All floors':'सभी मंज़िलें','You are here':'आप यहाँ हैं','Start: {name}':'शुरुआत: {name}','This kiosk':'यह कियोस्क','Main entrance':'मुख्य प्रवेश',
  'Women':'महिला','Men':'पुरुष','Toilets':'शौचालय','Rotate left':'बाएँ घुमाएँ','Rotate right':'दाएँ घुमाएँ','Evening':'शाम','Day':'दिन',
  'Showing the 2D map on this screen':'इस स्क्रीन पर 2D मैप दिख रहा है','Refreshing the map…':'मैप रीफ़्रेश हो रहा है…','Loading the 3D map…':'3D मैप लोड हो रहा है…',
  '{arrow} Escalator to {fl}':'{arrow} एस्केलेटर से {fl}','{arrow} Lift to {fl}':'{arrow} लिफ्ट से {fl}',
  'Taking the lift up to the {floor}':'लिफ्ट से ऊपर {floor} पर','Taking the lift down to the {floor}':'लिफ्ट से नीचे {floor} पर',
  'Riding the escalator up to the {floor}':'एस्केलेटर से ऊपर {floor} पर','Riding the escalator down to the {floor}':'एस्केलेटर से नीचे {floor} पर',
  'Walk to {dest}':'{dest} तक चलिए','Walk to the lift, then go up to the {floor}':'लिफ्ट तक चलिए, फिर ऊपर {floor} पर जाइए',
  'Walk to the lift, then go down to the {floor}':'लिफ्ट तक चलिए, फिर नीचे {floor} पर जाइए','Walk to the escalator, then go up to the {floor}':'एस्केलेटर तक चलिए, फिर ऊपर {floor} पर जाइए',
  'Walk to the escalator, then go down to the {floor}':'एस्केलेटर तक चलिए, फिर नीचे {floor} पर जाइए','your destination':'आपकी मंज़िल','Stop':'रोकें',
  // categories and groups
  'Fashion':'फ़ैशन','Accessories':'एक्सेसरीज़','Beauty & grooming':'ब्यूटी और ग्रूमिंग','Home & living':'होम और लिविंग','Food & drink':'खान-पान','Cinema':'सिनेमा',
  'Other stores':'अन्य स्टोर','Dining':'खान-पान','Home Decor':'होम डेकोर','Beauty & Wellness':'ब्यूटी और वेलनेस','Beauty':'ब्यूटी','More':'अन्य','All':'सभी',
  // tabs
  'Map':'मैप','Directory':'स्टोर सूची','Offers':'ऑफ़र','Events':'इवेंट','Services':'सेवाएँ','Home':'होम',
  // wait times, hours
  'Closed':'बंद','Not seating now':'अभी मेहमान नहीं ले रहे','Wait time not updated':'इंतज़ार का समय अपडेट नहीं हुआ','No wait':'कोई इंतज़ार नहीं',
  'Walk straight in':'सीधे अंदर जाइए','{n} min':'{n} मिनट','45+ min':'45+ मिनट','wait time':'इंतज़ार का समय','just now':'अभी-अभी','{n} min ago':'{n} मिनट पहले',
  '{n} h ago':'{n} घंटे पहले','{n} d ago':'{n} दिन पहले','Open now':'अभी खुला है','Closed now':'अभी बंद है','Unit {id}':'यूनिट {id}',' & ':' और ',
  'Open today {hours}':'आज खुला: {hours}','{n} restaurant with no wait':'{n} रेस्टोरेंट में कोई इंतज़ार नहीं','{n} restaurants with no wait':'{n} रेस्टोरेंट में कोई इंतज़ार नहीं',
  '{n} offer live':'{n} ऑफ़र चालू','{n} offers live':'{n} ऑफ़र चालू','Mall hours: ':'मॉल का समय: ',
  // routes
  'Take me here':'मुझे वहाँ ले चलिए','{min} min · {m} m':'{min} मिनट · {m} मीटर','{m} m':'{m} मीटर','From {name}':'{name} से',
  'One escalator ride':'एक बार एस्केलेटर','Two escalator rides':'दो बार एस्केलेटर','One lift ride':'एक बार लिफ्ट','Two lift rides':'दो बार लिफ्ट',
  'One lift or escalator ride':'एक बार लिफ्ट या एस्केलेटर','Two lift or escalator rides':'दो बार लिफ्ट या एस्केलेटर','Same floor, no stairs':'इसी मंज़िल पर, कोई सीढ़ी नहीं',
  ' · step-free':' · सुगम्य रास्ता','Step-free on':'सुगम्य रास्ता चालू','Need step-free?':'सुगम्य रास्ता चाहिए?','See all {n} steps':'सभी {n} चरण देखें',
  'Show {floor}':'{floor} दिखाएँ','The main entrance':'मुख्य प्रवेश','The lift':'लिफ्ट','The toilets':'शौचालय','You are already here.':'आप यहीं हैं।',
  'There is no step-free route from here. ':'यहाँ से कोई सुगम्य रास्ता नहीं है। ',"We couldn't plan a route from {from}. Please ask at the concierge desk.":'{from} से रास्ता नहीं बन सका। कृपया हेल्प डेस्क पर पूछिए।',
  'here':'यहाँ','No step-free route found to {name}':'{name} तक कोई सुगम्य रास्ता नहीं मिला','No route found to {name}. Please ask at the concierge desk.':'{name} तक रास्ता नहीं मिला। कृपया हेल्प डेस्क पर पूछिए।',
  'No route found. Please ask at the concierge desk.':'रास्ता नहीं मिला। कृपया हेल्प डेस्क पर पूछिए।',
  'Step-free routes on: lifts only, no escalators':'सुगम्य रास्ता चालू: सिर्फ़ लिफ्ट, एस्केलेटर नहीं','Step-free routes off':'सुगम्य रास्ता बंद',
  "Nearest men's toilets":'सबसे पास का पुरुष शौचालय',"Nearest women's toilets":'सबसे पास का महिला शौचालय','Nearest toilets':'सबसे पास का शौचालय','Nearest lift':'सबसे पास की लिफ्ट',
  'Way out · main entrance':'बाहर का रास्ता · मुख्य प्रवेश',"Men's toilets":'पुरुष शौचालय',"Women's toilets":'महिला शौचालय','Nearest':'सबसे पास',"Women's":'महिला',"Men's":'पुरुष',
  // store card
  'Live now':'अभी लाइव','updated {ago}':'{ago} अपडेट हुआ',"Today's specials":'आज के स्पेशल','Offer':'ऑफ़र','until {date}':'{date} तक','Featured':'ख़ास',
  'Menu highlights:':'मेन्यू की ख़ास चीज़ें:','Event':'इवेंट','Back':'वापस','See all floors':'सभी मंज़िलें देखें','{name} logo':'{name} लोगो',
  '{floor}. No store is listed for this unit yet.':'{floor}। इस यूनिट में अभी कोई स्टोर नहीं है।',
  // services, help
  'Lifts':'लिफ्ट','Exit':'निकास','Step-free route':'सुगम्य रास्ता','Help desk':'हेल्प डेस्क','Evening view':'शाम का नज़ारा','Day view':'दिन का नज़ारा',
  'How can we help?':'हम आपकी क्या मदद करें?','Call the concierge desk on {n}':'हेल्प डेस्क को {n} पर कॉल कीजिए',
  'Please visit the concierge desk, or ask any member of the mall team.':'कृपया हेल्प डेस्क पर आइए, या मॉल के किसी भी कर्मचारी से पूछिए।','Close':'बंद करें','Language':'भाषा',
  // lists
  'All stores A–Z ({n})':'सभी स्टोर A–Z ({n})','Results ({n})':'नतीजे ({n})','{group} · live wait times':'{group} · इंतज़ार का लाइव समय','Show all':'सब दिखाएँ',
  'Nothing matches “{q}”. Try a store name, or a word like <i>coffee</i>, <i>jewellery</i> or <i>salon</i>.':'“{q}” से कुछ नहीं मिला। स्टोर का नाम लिखिए, या <i>coffee</i>, <i>कॉफ़ी</i>, <i>ज्वेलरी</i> या <i>सैलून</i> जैसे शब्द।',
  'Nothing matches “{q}”.':'“{q}” से कुछ नहीं मिला।','Offers live now ({n})':'अभी चालू ऑफ़र ({n})','No offers are live right now.':'अभी कोई ऑफ़र चालू नहीं है।',
  'Events at {venue}':'{venue} में इवेंट','Dine at {venue}':'{venue} में खान-पान','View all':'सब देखें','Offers today':'आज के ऑफ़र',
  'No upcoming events are listed right now.':'अभी कोई आने वाला इवेंट नहीं है।','New events show up here as soon as they are announced.':'नए इवेंट की घोषणा होते ही वे यहाँ दिखेंगे।',"See today's offers":'आज के ऑफ़र देखिए','Stores add their offers here as they go live.':'स्टोर अपने ऑफ़र चालू होते ही यहाँ जोड़ते हैं।','Soon':'जल्द','Featured stores':'ख़ास स्टोर',
  // phone app
  'Good morning':'सुप्रभात','Good afternoon':'नमस्ते','Good evening':'शुभ संध्या','Welcome to {venue}':'{venue} में आपका स्वागत है',
  'The Wayezy app':'Wayezy ऐप','Take this route on your phone':'यह रास्ता अपने फ़ोन पर ले जाइए','The map on your phone':'मैप अपने फ़ोन पर',
  'Scan with your phone camera. The route opens in the app, starting from this kiosk.':'अपने फ़ोन के कैमरे से स्कैन कीजिए। रास्ता ऐप में खुलेगा, इसी कियोस्क से शुरू होकर।',
  'Scan to find your way anywhere in the mall, starting from this kiosk.':'स्कैन कीजिए और इसी कियोस्क से मॉल में कहीं भी रास्ता पाइए।',
  'QR code: this route on your phone':'QR कोड: यह रास्ता आपके फ़ोन पर','QR code: the mall map on your phone':'QR कोड: मॉल का मैप आपके फ़ोन पर',
  'Main entrance ':'मुख्य प्रवेश ','The kiosk I scanned':'जिस कियोस्क को स्कैन किया','Starting from':'कहाँ से शुरू करें','Your destination':'आपकी मंज़िल','Change':'बदलें',
  'Your route':'आपका रास्ता','Start':'शुरुआत','Follow route':'रास्ते पर चलिए','{n} steps':'{n} चरण','Change floor':'मंज़िल बदलिए','Straight on':'सीधे','Arrive':'मंज़िल',
  'Step-by-step directions':'चरण-दर-चरण रास्ता','Dining · live wait times':'खान-पान · इंतज़ार का लाइव समय','Offers for you':'आपके लिए ऑफ़र','See all':'सब देखें',
  'Nearby dining':'पास में खान-पान','{k} of {n}':'{n} में से {k}',
  'FIND':'खोजिए','STORES & DINING':'स्टोर और खान-पान','Real-time guidance':'रियल-टाइम रास्ता','LIVE':'लाइव','WAIT TIMES':'इंतज़ार का समय',
  'Updated by each restaurant':'हर रेस्टोरेंट खुद अपडेट करता है','OFFERS':'ऑफ़र','AS THEY GO LIVE':'चालू होते ही','Straight from the stores':'सीधे स्टोर से',
  // keyboard, ads
  'Delete':'मिटाएँ','Space':'स्पेस','Done':'हो गया','Sponsored':'प्रायोजित',
  // route mode
  'Step {k} of {n}':'चरण {k}/{n}','Arriving':'मंज़िल पास है','then {m} m':'फिर {m} मीटर','Up to {fl}':'ऊपर {fl} तक','Down to {fl}':'नीचे {fl} तक','Then':'फिर',
  'Change floor on the way':'रास्ते में मंज़िल बदलनी है','Voice on':'आवाज़ चालू','Voice off':'आवाज़ बंद','Pause':'रोकें','Resume':'जारी रखें','Play':'चलाएँ','End':'समाप्त',
  'You have arrived':'आपकी मंज़िल आ गई','Replay route':'रास्ता दोबारा देखें','Back to search in {n} s':'{n} सेकंड में खोज पर वापस',
  'Previous step':'पिछला चरण','Next step':'अगला चरण','Spoken directions':'बोलकर रास्ता',
  'This device has no Hindi voice, so directions will be spoken in English.':'इस डिवाइस पर हिन्दी आवाज़ नहीं है, इसलिए रास्ता अंग्रेज़ी में बोला जाएगा।',
  // the page itself
  'SHOP · DINE · EXPLORE':'खरीदारी · खान-पान · सैर','FIND · EXPLORE · ENJOY':'खोजिए · घूमिए · आनंद लीजिए','Search shops, dining, home decor, services…':'स्टोर, खान-पान, होम डेकोर, सेवाएँ खोजें…',
  'Search stores, food or services':'स्टोर, खाना या सेवाएँ खोजें','Search':'खोजें','Need help?':'मदद चाहिए?','Touch to call':'कॉल के लिए छुएँ',
  'Discover your way':'अपना रास्ता खोजिए','STORES · DINING · EXPERIENCES':'स्टोर · खान-पान · अनुभव',
  'The same live map, offers and wait times as the in-mall kiosks, in your pocket.':'मॉल के कियोस्क वाला वही लाइव मैप, ऑफ़र और इंतज़ार का समय, अब आपकी जेब में।',
  'Explore the mall':'मॉल घूमिए','Tap any shop':'किसी भी स्टोर पर टैप करें','Find any store in seconds':'कोई भी स्टोर, पलों में खोजिए',
  'Touch anywhere to start':'शुरू करने के लिए स्क्रीन छुएँ','Skip':'स्किप कीजिए','Skip the intro':'इंट्रो स्किप कीजिए','Zoom in':'ज़ूम इन','Zoom out':'ज़ूम आउट','Show whole floor':'पूरी मंज़िल दिखाएँ',
  'Floor plan of {venue}':'{venue} का फ़्लोर प्लान','“All floors” needs the 3D map. Use the floor buttons.':'“सभी मंज़िलें” के लिए 3D मैप चाहिए। मंज़िल के बटन इस्तेमाल करें।',
  'My location':'मेरी लोकेशन','Your location':'आपकी लोकेशन','Live location':'लाइव लोकेशन','±{m} m':'±{m} मीटर','simulated':'सिमुलेशन',
  'Looking for your location…':'आपकी लोकेशन खोजी जा रही है…','Following your location':'आपकी लोकेशन के साथ-साथ',
  'You have left the route. Here is a new one.':'आप रास्ते से हट गए हैं। यह रहा नया रास्ता।',
  // members (member.js) and the phone app's tabs
  'Account':'अकाउंट','Member':'मेंबर','Membership':'मेंबरशिप','Points':'पॉइंट','Member since':'कब से मेंबर','Member number {n}':'मेंबर नंबर {n}','Settings':'सेटिंग',
  'Get more from every visit':'हर विज़िट में पाइए कुछ ज़्यादा','Join in a minute with your mobile number.':'अपने मोबाइल नंबर से एक मिनट में जुड़िए।','Sign in or join':'साइन इन कीजिए या जुड़िए',
  'What members get':'मेंबर को क्या मिलता है','Members-only offers':'सिर्फ़ मेंबर के लिए ऑफ़र','Offers from the stores that only members can use.':'स्टोर के ऐसे ऑफ़र, जो सिर्फ़ मेंबर इस्तेमाल कर सकते हैं।',
  'Your stores':'आपके स्टोर','Save the stores you like and get to them in one tap.':'पसंद के स्टोर सेव कीजिए और एक टैप में वहाँ पहुँचिए।',
  'Your points and what they were for, in one place.':'आपके पॉइंट और वे किसलिए मिले, सब एक जगह।','Remembered for you':'आपकी पसंद याद रहेगी',
  'Your language and step-free choice, on any phone you sign in on.':'आपकी भाषा और सुगम्य रास्ते की पसंद, हर उस फ़ोन पर जहाँ आप साइन इन करें।',
  'Step-free routes':'सुगम्य रास्ते','Evening map':'शाम का मैप','Saved stores':'सेव किए स्टोर','Member offers':'मेंबर ऑफ़र','Just for members':'सिर्फ़ मेंबर के लिए',
  'Tap the heart on any store to keep it here.':'किसी भी स्टोर पर दिल का निशान टैप कीजिए, वह यहाँ दिखेगा।','Points used':'पॉइंट इस्तेमाल हुए','Points added':'पॉइंट जुड़े',
  'Points the mall adds for you will show here.':'मॉल आपके लिए जो पॉइंट जोड़ेगा, वे यहाँ दिखेंगे।','Change name':'नाम बदलें','Sign out':'साइन आउट','You are signed out':'साइन आउट हो गया है',
  'Membership needs a connection to the mall.':'मेंबरशिप के लिए मॉल से कनेक्शन चाहिए।','Membership needs a connection to the mall. Your settings are below.':'मेंबरशिप के लिए मॉल से कनेक्शन चाहिए। आपकी सेटिंग नीचे हैं।',
  'Sign in to save your stores':'अपने स्टोर सेव करने के लिए साइन इन कीजिए','Enter your mobile number. We will text you a 6-digit code.':'अपना मोबाइल नंबर लिखिए। हम आपको 6 अंकों का कोड SMS करेंगे।',
  'Mobile number':'मोबाइल नंबर','Send code':'कोड भेजें','Your number is used only to sign you in.':'आपका नंबर सिर्फ़ साइन इन के लिए इस्तेमाल होता है।','Not now':'अभी नहीं',
  'Enter a 10-digit mobile number.':'10 अंकों का मोबाइल नंबर लिखिए।','Enter the code':'कोड लिखिए','Sent to +91 {n}':'+91 {n} पर भेजा गया','Demo mode':'डेमो मोड',
  'No SMS service is connected yet, so here is your code:':'अभी SMS सेवा जुड़ी नहीं है, इसलिए आपका कोड यह रहा:','6-digit code':'6 अंकों का कोड','Sign in':'साइन इन',
  'Use a different number':'दूसरा नंबर इस्तेमाल करें','Enter the 6-digit code.':'6 अंकों का कोड लिखिए।','Welcome back, {name}':'फिर से स्वागत है, {name}',
  'Welcome! What is your name?':'स्वागत है! आपका नाम क्या है?','Your name':'आपका नाम','It goes on your member card.':'यह आपके मेंबर कार्ड पर दिखेगा।','Save':'सेव करें','Skip for now':'अभी छोड़ें',
  'Enter your name.':'अपना नाम लिखिए।','You are a member now. Welcome!':'अब आप मेंबर हैं। स्वागत है!','No connection. Check the internet and try again.':'कनेक्शन नहीं है। इंटरनेट देखकर दोबारा कोशिश कीजिए।',
  'Something went wrong. Try again.':'कुछ गड़बड़ हो गई। दोबारा कोशिश कीजिए।','Members-only offer':'सिर्फ़ मेंबर के लिए ऑफ़र','Saved':'सेव किया हुआ','Members only':'सिर्फ़ मेंबर',
  'Sign in to use this offer':'इस ऑफ़र के लिए साइन इन कीजिए','Sign in on the Wayezy app to use it':'इसके लिए Wayezy ऐप में साइन इन कीजिए',
  'Good to see you at {venue}':'{venue} में आपको देखकर अच्छा लगा','Join':'जुड़िए','Help':'मदद','Remove from your stores':'अपने स्टोर से हटाएँ','Save to your stores':'अपने स्टोर में सेव करें',
  '{n} offer live across the mall today':'आज मॉल में {n} ऑफ़र चालू','{n} offers live across the mall today':'आज मॉल में {n} ऑफ़र चालू','All offers':'सभी ऑफ़र','For members':'मेंबर के लिए',
  'No members-only offers right now. New ones appear here first.':'अभी सिर्फ़ मेंबर वाला कोई ऑफ़र नहीं है। नए ऑफ़र सबसे पहले यहीं दिखेंगे।',
  'What is on at {venue}':'{venue} में क्या चल रहा है','Nothing is planned just now. Check back soon.':'अभी कुछ तय नहीं है। जल्द फिर देखिए।',
  // find my car, the card
  'Show my member card':'मेरा मेंबर कार्ड दिखाएँ','Show this at the counter':'इसे काउंटर पर दिखाइए','Hello':'नमस्ते','Show card':'कार्ड दिखाएँ','Find my car':'मेरी कार ढूँढें','My car':'मेरी कार',
  'Save where you parked in the basement, and get taken back to it.':'बेसमेंट में आपने कार कहाँ पार्क की, यह सेव कीजिए; ऐप आपको वहीं वापस ले जाएगा।',
  'Your car':'आपकी कार','Parked in the basement?':'बेसमेंट में कार पार्क की है?','Save your spot, and the app takes you back to it.':'अपनी जगह सेव कीजिए, ऐप आपको वहीं वापस ले जाएगा।',
  'Saved {ago}':'{ago} सेव किया','Car collected':'कार ले ली','Where did you park?':'कार कहाँ पार्क की?','Choose the level, then the pillar or bay number nearest your car.':'लेवल चुनिए, फिर कार के सबसे पास वाले पिलर या बे का नंबर लिखिए।',
  'Level':'लेवल','Pillar or bay, e.g. P-23':'पिलर या बे, जैसे P-23','Pillar or bay number':'पिलर या बे नंबर','A note, if you like (near the ramp…)':'चाहें तो एक नोट (जैसे रैंप के पास…)','Note':'नोट',
  'Save my spot':'मेरी जगह सेव करें','Tip: scan the QR code on the pillar to save it in one go.':'टिप: पिलर पर लगा QR कोड स्कैन कीजिए, जगह तुरंत सेव हो जाएगी।','Enter the pillar or bay number.':'पिलर या बे का नंबर लिखिए।',
  'Parking spot saved: {level} · {spot}':'पार्किंग की जगह सेव हुई: {level} · {spot}','Parking spot cleared':'पार्किंग की जगह हटा दी गई','the lift':'लिफ्ट','via {lift}':'{lift} से होकर',
  'Take {lift} down to {level}. Your car is at {spot}.':'{lift} से नीचे {level} पर जाइए। आपकी कार {spot} पर है।','Sign in to save where you parked':'पार्किंग की जगह सेव करने के लिए साइन इन कीजिए',
  'Now take the lift down':'अब लिफ्ट से नीचे जाइए','Choose the level and enter the pillar or bay number.':'लेवल चुनिए और पिलर या बे नंबर लिखिए।',
  // what the server may answer when signing in
  'Too many tries. Wait a minute.':'बहुत बार कोशिश हो चुकी है। एक मिनट रुकिए।','Too many codes for this number. Try again in an hour.':'इस नंबर पर बहुत कोड भेजे जा चुके हैं। एक घंटे बाद कोशिश कीजिए।',
  'A code was just sent. Wait a few seconds.':'कोड अभी-अभी भेजा गया है। कुछ सेकंड रुकिए।','That code has expired. Ask for a new one.':'यह कोड अब मान्य नहीं है। नया कोड मँगाइए।',
  'Too many wrong codes. Ask for a new one.':'कई बार ग़लत कोड डाला गया। नया कोड मँगाइए।','That code is not right.':'यह कोड सही नहीं है।','Please sign in again.':'कृपया दोबारा साइन इन कीजिए।',
  'The code could not be sent. Try again in a moment.':'कोड भेजा नहीं जा सका। थोड़ी देर में दोबारा कोशिश कीजिए।',
  'Choose floor':'मंज़िल चुनें','Expand map':'मैप बड़ा करें','Switch between 3D and top-down view':'3D और ऊपर से दिखने वाले मैप के बीच बदलें',
  'Face the map the way the kiosk faces':'मैप को कियोस्क की दिशा में घुमाएँ','Choose your language':'अपनी भाषा चुनें'
};
/* sample content shipped with the demo (every item is marked sample:true); what stores and the mall type themselves shows as typed */
const HIC={
  'Evenings on the Boulevard':'Boulevard पर शाम की रौनक','Live music by the fountains, Fridays':'हर शुक्रवार, फ़व्वारों के पास लाइव संगीत','At Ireo Boulevard':'Ireo Boulevard में',
  'The Autumn Collection':'द ऑटम कलेक्शन','Now in store':'अब स्टोर में','Featured':'ख़ास',
  'Buy 1 Get 1 Free':'1 खरीदें, 1 मुफ़्त पाएँ','Afternoon treat':'दोपहर की ख़ास पेशकश','On handcrafted beverages, 3–5 PM':'हैंडक्राफ़्टेड ड्रिंक्स पर, दोपहर 3–5 बजे',
  'Festive Edit':'फ़ेस्टिव एडिट','The Festive Edit':'द फ़ेस्टिव एडिट','New in store':'स्टोर में नया','Seasonal home collection now in':'सीज़नल होम कलेक्शन अब उपलब्ध',
  'Seasonal home collection':'सीज़नल होम कलेक्शन','Flat 30% off':'सीधे 30% की छूट','Season special':'सीज़न स्पेशल','On selected styles':'चुनिंदा स्टाइल पर',
  'Free gift':'मुफ़्त उपहार','With purchase':'खरीदारी के साथ','On orders above ₹3,000':'₹3,000 से ज़्यादा की खरीदारी पर','Sneaker drop Saturday':'शनिवार को नए स्नीकर्स',
  'Launch':'लॉन्च','Limited pairs from 11 AM':'सुबह 11 बजे से, सीमित जोड़े','Handcrafted beverages, 3–5 PM':'हैंडक्राफ़्टेड ड्रिंक्स, दोपहर 3–5 बजे',
  'Seasonal beverages are here':'सीज़नल ड्रिंक्स आ गए हैं','Try one this afternoon':'आज दोपहर ज़रूर आज़माइए',
  'Cold brew, made fresh this morning':'कोल्ड ब्रू, आज सुबह ताज़ा बना','Warm croissants until noon':'दोपहर 12 बजे तक गरमा-गरम क्रोसां','Pour-over of the week':'इस हफ़्ते की पोर-ओवर कॉफ़ी',
  'A cookie with any coffee':'किसी भी कॉफ़ी के साथ एक कुकी','Show your member card at the counter':'काउंटर पर अपना मेंबर कार्ड दिखाइए','Extra 10% off':'10% की अतिरिक्त छूट',
  'On the Autumn Collection, for members':'ऑटम कलेक्शन पर, मेंबर के लिए',
  'Live acoustic evening':'लाइव अकूस्टिक शाम','7–9 PM':'शाम 7–9 बजे','Central boulevard':'Boulevard के बीचोंबीच','Acoustic sets by the water features.':'फ़व्वारों के पास अकूस्टिक संगीत।'
};
function fill(s,v){return v?String(s).replace(/\{(\w+)\}/g,(m,k)=>v[k]!==undefined?v[k]:m):String(s);}
function T(s,v){if(s==null)return '';return fill(LANG==='hi'&&HI[s]!==undefined?HI[s]:s,v);}
function tc(s){if(LANG!=='hi'||s==null)return s;const k=String(s).trim();return HIC[k]!==undefined?HIC[k]:s;}
/* names from the floor plans */
function tr(s){if(LANG!=='hi'||!s)return s;if(HI[s]!==undefined)return HI[s];
  const map={'Multiplex':'मल्टीप्लेक्स','Office tower':'ऑफ़िस टावर','Courtyard':'आँगन','Courtyard below':'नीचे आँगन','Open to below':'नीचे खुला हिस्सा','Entrance hall':'प्रवेश हॉल','Anchor block lifts':'एंकर ब्लॉक की लिफ्ट'};
  if(map[s])return map[s];let m;
  if((m=/^Terrace (\w+)$/.exec(s)))return 'टैरेस '+m[1];
  if((m=/^Lift (\w+)$/.exec(s)))return 'लिफ्ट '+m[1];
  if((m=/^escalator (?:by|at) Lift (\w+)$/i.exec(s)))return 'लिफ्ट '+m[1]+' के पास का एस्केलेटर';
  return s;}
const floorName=f=>T(FLOORS[f].name);
/* run fn as if the page were in language l (e.g. English speech on a device with no Hindi voice) */
function inLang(l,fn){const o=LANG;LANG=l;try{return fn();}finally{LANG=o;}}
const catName=c=>T(CATS[c]?CATS[c].name:'');
const FL_HI={G:'ग्राउंड फ़्लोर',F:'पहली मंज़िल',S:'दूसरी मंज़िल'};
const flShort=f=>LANG==='hi'?(FL_HI[f]||FL[f]):FL[f];          // "1F" in English lists, the floor's name in Hindi
/* times as people say them: "सुबह 10 बजे", "रात 11 बजे", "दोपहर 2:30" (English: 10:00 AM). clock: always hh:mm */
function clockText(h,m,clock){if(LANG!=='hi'){const ap=h>=12?'PM':'AM';return ((h%12)||12)+':'+String(m).padStart(2,'0')+' '+ap;}
  const part=h>=4&&h<12?'सुबह':h>=12&&h<16?'दोपहर':h>=16&&h<19?'शाम':'रात';const hh=(h%12)||12;
  return m||clock?`${part} ${hh}:${String(m).padStart(2,'0')}`:`${part} ${hh} बजे`;}
const locale=()=>LANG==='hi'?'hi-IN':'en-GB';
/* the page's fixed words: data-i18n (text; empty = its own English text), data-i18n-ph (placeholder), data-i18n-aria.
   English puts back exactly what the page had. */
function applyStaticText(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{if(el._en===undefined){el._en=el.innerHTML;el._key=el.dataset.i18n||el.textContent.replace(/\s+/g,' ').trim();}
    if(LANG==='en'||HI[el._key]===undefined)el.innerHTML=el._en;else el.textContent=HI[el._key];});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=T(el.dataset.i18nPh);});
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',T(el.dataset.i18nAria));});}
/* switch language everywhere; byUser: the visitor chose it (the phone remembers) */
function setLang(l,byUser){if(!LANGS[l])l='en';const changed=l!==LANG;LANG=l;
  document.documentElement.lang=l;document.body.classList.toggle('lang-hi',l==='hi');
  if(byUser&&typeof VIEW!=='undefined'&&VIEW==='app')try{localStorage.setItem('ireo.lang',l);}catch(e){}
  applyStaticText();if(changed&&typeof onLang==='function')onLang();}
