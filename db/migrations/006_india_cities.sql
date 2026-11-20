-- Cover all Indian tier-1 (X) and tier-2 (Y) cities, per the Government of
-- India HRA city classification. Tier is stored for grouping in the UI.

alter table jobradar.locations add column if not exists tier smallint check (tier in (1, 2, 3));

insert into jobradar.locations (slug, name, kind, state, aliases, sort_order) values
  ('agra', 'Agra', 'city', 'Uttar Pradesh', array['agra'], 200),
  ('ajmer', 'Ajmer', 'city', 'Rajasthan', array['ajmer'], 200),
  ('aligarh', 'Aligarh', 'city', 'Uttar Pradesh', array['aligarh'], 200),
  ('amravati', 'Amravati', 'city', 'Maharashtra', array['amravati'], 200),
  ('amritsar', 'Amritsar', 'city', 'Punjab', array['amritsar'], 200),
  ('anand', 'Anand', 'city', 'Gujarat', array['anand gujarat','anand, gujarat','vallabh vidyanagar'], 200),
  ('asansol', 'Asansol', 'city', 'West Bengal', array['asansol'], 200),
  ('aurangabad', 'Chhatrapati Sambhajinagar (Aurangabad)', 'city', 'Maharashtra', array['aurangabad','chhatrapati sambhajinagar','sambhajinagar'], 200),
  ('bareilly', 'Bareilly', 'city', 'Uttar Pradesh', array['bareilly'], 200),
  ('belagavi', 'Belagavi', 'city', 'Karnataka', array['belagavi','belgaum'], 200),
  ('bhavnagar', 'Bhavnagar', 'city', 'Gujarat', array['bhavnagar'], 200),
  ('bhiwandi', 'Bhiwandi', 'city', 'Maharashtra', array['bhiwandi'], 200),
  ('bikaner', 'Bikaner', 'city', 'Rajasthan', array['bikaner'], 200),
  ('bilaspur', 'Bilaspur', 'city', 'Chhattisgarh', array['bilaspur'], 200),
  ('bokaro', 'Bokaro', 'city', 'Jharkhand', array['bokaro','bokaro steel city'], 200),
  ('cuttack', 'Cuttack', 'city', 'Odisha', array['cuttack'], 200),
  ('dehradun', 'Dehradun', 'city', 'Uttarakhand', array['dehradun','dehra dun'], 200),
  ('dhanbad', 'Dhanbad', 'city', 'Jharkhand', array['dhanbad'], 200),
  ('bhilai', 'Bhilai-Durg', 'city', 'Chhattisgarh', array['bhilai','durg'], 200),
  ('durgapur', 'Durgapur', 'city', 'West Bengal', array['durgapur'], 200),
  ('erode', 'Erode', 'city', 'Tamil Nadu', array['erode'], 200),
  ('firozabad', 'Firozabad', 'city', 'Uttar Pradesh', array['firozabad'], 200),
  ('gorakhpur', 'Gorakhpur', 'city', 'Uttar Pradesh', array['gorakhpur'], 200),
  ('kalaburagi', 'Kalaburagi', 'city', 'Karnataka', array['kalaburagi','gulbarga'], 200),
  ('guntur', 'Guntur', 'city', 'Andhra Pradesh', array['guntur'], 200),
  ('gwalior', 'Gwalior', 'city', 'Madhya Pradesh', array['gwalior'], 200),
  ('guwahati', 'Guwahati', 'city', 'Assam', array['guwahati','gauhati'], 200),
  ('hamirpur', 'Hamirpur', 'city', 'Himachal Pradesh', array['hamirpur'], 200),
  ('hubballi-dharwad', 'Hubballi-Dharwad', 'city', 'Karnataka', array['hubli','hubballi','dharwad'], 200),
  ('jabalpur', 'Jabalpur', 'city', 'Madhya Pradesh', array['jabalpur'], 200),
  ('jalandhar', 'Jalandhar', 'city', 'Punjab', array['jalandhar'], 200),
  ('jammu', 'Jammu', 'city', 'Jammu & Kashmir', array['jammu'], 200),
  ('jamnagar', 'Jamnagar', 'city', 'Gujarat', array['jamnagar'], 200),
  ('jamshedpur', 'Jamshedpur', 'city', 'Jharkhand', array['jamshedpur'], 200),
  ('jhansi', 'Jhansi', 'city', 'Uttar Pradesh', array['jhansi'], 200),
  ('jodhpur', 'Jodhpur', 'city', 'Rajasthan', array['jodhpur'], 200),
  ('kakinada', 'Kakinada', 'city', 'Andhra Pradesh', array['kakinada'], 200),
  ('kannur', 'Kannur', 'city', 'Kerala', array['kannur'], 200),
  ('kanpur', 'Kanpur', 'city', 'Uttar Pradesh', array['kanpur'], 200),
  ('karnal', 'Karnal', 'city', 'Haryana', array['karnal'], 200),
  ('kolhapur', 'Kolhapur', 'city', 'Maharashtra', array['kolhapur'], 200),
  ('kollam', 'Kollam', 'city', 'Kerala', array['kollam','quilon'], 200),
  ('kozhikode', 'Kozhikode', 'city', 'Kerala', array['kozhikode','calicut'], 200),
  ('kurnool', 'Kurnool', 'city', 'Andhra Pradesh', array['kurnool'], 200),
  ('ludhiana', 'Ludhiana', 'city', 'Punjab', array['ludhiana'], 200),
  ('madurai', 'Madurai', 'city', 'Tamil Nadu', array['madurai'], 200),
  ('malappuram', 'Malappuram', 'city', 'Kerala', array['malappuram'], 200),
  ('mathura', 'Mathura', 'city', 'Uttar Pradesh', array['mathura'], 200),
  ('mangaluru', 'Mangaluru', 'city', 'Karnataka', array['mangaluru','mangalore'], 200),
  ('meerut', 'Meerut', 'city', 'Uttar Pradesh', array['meerut'], 200),
  ('moradabad', 'Moradabad', 'city', 'Uttar Pradesh', array['moradabad'], 200),
  ('nanded', 'Nanded', 'city', 'Maharashtra', array['nanded'], 200),
  ('nellore', 'Nellore', 'city', 'Andhra Pradesh', array['nellore'], 200),
  ('patna', 'Patna', 'city', 'Bihar', array['patna'], 200),
  ('puducherry', 'Puducherry', 'city', 'Puducherry', array['puducherry','pondicherry'], 200),
  ('purulia', 'Purulia', 'city', 'West Bengal', array['purulia'], 200),
  ('prayagraj', 'Prayagraj', 'city', 'Uttar Pradesh', array['prayagraj','allahabad'], 200),
  ('raipur', 'Raipur', 'city', 'Chhattisgarh', array['raipur'], 200),
  ('rajahmundry', 'Rajahmundry', 'city', 'Andhra Pradesh', array['rajahmundry','rajamahendravaram'], 200),
  ('ranchi', 'Ranchi', 'city', 'Jharkhand', array['ranchi'], 200),
  ('rourkela', 'Rourkela', 'city', 'Odisha', array['rourkela'], 200),
  ('ratlam', 'Ratlam', 'city', 'Madhya Pradesh', array['ratlam'], 200),
  ('salem', 'Salem', 'city', 'Tamil Nadu', array['salem tamil nadu','salem, tamil nadu','salem, tn'], 200),
  ('sangli', 'Sangli', 'city', 'Maharashtra', array['sangli'], 200),
  ('shimla', 'Shimla', 'city', 'Himachal Pradesh', array['shimla'], 200),
  ('siliguri', 'Siliguri', 'city', 'West Bengal', array['siliguri'], 200),
  ('solapur', 'Solapur', 'city', 'Maharashtra', array['solapur'], 200),
  ('srinagar', 'Srinagar', 'city', 'Jammu & Kashmir', array['srinagar'], 200),
  ('thanjavur', 'Thanjavur', 'city', 'Tamil Nadu', array['thanjavur','tanjore'], 200),
  ('thrissur', 'Thrissur', 'city', 'Kerala', array['thrissur','trichur'], 200),
  ('tiruchirappalli', 'Tiruchirappalli', 'city', 'Tamil Nadu', array['tiruchirappalli','trichy','tiruchi'], 200),
  ('tirunelveli', 'Tirunelveli', 'city', 'Tamil Nadu', array['tirunelveli'], 200),
  ('tiruvannamalai', 'Tiruvannamalai', 'city', 'Tamil Nadu', array['tiruvannamalai'], 200),
  ('ujjain', 'Ujjain', 'city', 'Madhya Pradesh', array['ujjain'], 200),
  ('vijayapura', 'Vijayapura', 'city', 'Karnataka', array['vijayapura','bijapur'], 200),
  ('varanasi', 'Varanasi', 'city', 'Uttar Pradesh', array['varanasi','banaras','benares'], 200),
  ('vasai-virar', 'Vasai-Virar', 'city', 'Maharashtra', array['vasai','virar'], 200),
  ('vijayawada', 'Vijayawada', 'city', 'Andhra Pradesh', array['vijayawada'], 200),
  ('vellore', 'Vellore', 'city', 'Tamil Nadu', array['vellore'], 200),
  ('warangal', 'Warangal', 'city', 'Telangana', array['warangal'], 200),
  ('tiruppur', 'Tiruppur', 'city', 'Tamil Nadu', array['tiruppur','tirupur'], 200),
  ('tirupati', 'Tirupati', 'city', 'Andhra Pradesh', array['tirupati'], 200),
  ('udaipur', 'Udaipur', 'city', 'Rajasthan', array['udaipur'], 200),
  ('kota', 'Kota', 'city', 'Rajasthan', array['kota rajasthan','kota, rajasthan'], 200),
  ('bhubaneswar', 'Bhubaneswar', 'city', 'Odisha', array['bhubaneswar','bhubaneshwar'], 200)
on conflict (slug) do update set name = excluded.name, state = excluded.state, aliases = excluded.aliases;

-- Delhi NCR and Mumbai metro cover their satellite cities.
update jobradar.locations set name = 'Delhi NCR', aliases = array['delhi','new delhi','ncr','delhi ncr','gurgaon','gurugram','noida','greater noida','ghaziabad','faridabad'] where slug = 'delhi-ncr';
update jobradar.locations set aliases = array['mumbai','bombay','navi mumbai','thane','mumbai metropolitan region','powai','andheri'] where slug = 'mumbai';
update jobradar.locations set aliases = array['hyderabad','secunderabad','hitech city','gachibowli'] where slug = 'hyderabad';

update jobradar.locations set tier = 1, sort_order = 10 where slug in ('mumbai','delhi-ncr','bengaluru','hyderabad','chennai','kolkata','pune','ahmedabad');
update jobradar.locations set tier = 2, sort_order = 200 where kind = 'city' and slug not in ('mumbai','delhi-ncr','bengaluru','hyderabad','chennai','kolkata','pune','ahmedabad', 'india')
  and slug in ('surat','vadodara','rajkot','gandhinagar','jaipur','indore','kochi','chandigarh','coimbatore','nagpur','nashik','lucknow','bhopal','thiruvananthapuram','mysuru','visakhapatnam','agra','ajmer','aligarh','amravati','amritsar','anand','asansol','aurangabad','bareilly','belagavi','bhavnagar','bhiwandi','bikaner','bilaspur','bokaro','cuttack','dehradun','dhanbad','bhilai','durgapur','erode','firozabad','gorakhpur','kalaburagi','guntur','gwalior','guwahati','hamirpur','hubballi-dharwad','jabalpur','jalandhar','jammu','jamnagar','jamshedpur','jhansi','jodhpur','kakinada','kannur','kanpur','karnal','kolhapur','kollam','kozhikode','kurnool','ludhiana','madurai','malappuram','mathura','mangaluru','meerut','moradabad','nanded','nellore','patna','puducherry','purulia','prayagraj','raipur','rajahmundry','ranchi','rourkela','ratlam','salem','sangli','shimla','siliguri','solapur','srinagar','thanjavur','thrissur','tiruchirappalli','tirunelveli','tiruvannamalai','ujjain','vijayapura','varanasi','vasai-virar','vijayawada','vellore','warangal','tiruppur','tirupati','udaipur','kota','bhubaneswar');
update jobradar.locations set tier = 3, sort_order = 300 where kind = 'city' and tier is null and slug <> 'india';
update jobradar.locations set sort_order = 5 where slug = 'surat';
update jobradar.locations set sort_order = 999 where slug = 'india';
