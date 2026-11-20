-- Reference data: categories, locations, skills, synonyms, sources, settings.
-- Idempotent: safe to run repeatedly.

insert into jobradar.categories (slug, name, keywords, sort_order) values
  ('software-development', 'Software Development', array['developer','software engineer','programmer','frontend','front-end','backend','back-end','full stack','fullstack','react','node','java','python','php','laravel','.net','golang','ruby','android','ios','flutter','mobile developer','web developer','qa','tester','sdet'], 10),
  ('digital-marketing', 'Digital Marketing', array['digital marketing','seo','sem','social media','performance marketing','google ads','facebook ads','meta ads','ppc','marketing executive','growth marketing','email marketing','content marketing','marketing manager','brand'], 20),
  ('data-analytics', 'Data & Analytics', array['data analyst','data scientist','data engineer','analytics','machine learning','ml engineer','ai engineer','business intelligence','power bi','tableau','sql analyst','statistician'], 30),
  ('design', 'Design & Creative', array['designer','ui','ux','graphic','product designer','illustrator','motion','video editor','figma','creative','photographer','animator'], 40),
  ('devops-cloud', 'DevOps & Cloud', array['devops','sre','site reliability','cloud','aws','azure','gcp','kubernetes','infrastructure','platform engineer','system administrator','sysadmin','network engineer','security engineer','cybersecurity'], 50),
  ('product-management', 'Product & Project Management', array['product manager','product owner','project manager','program manager','scrum master','delivery manager'], 60),
  ('sales-business', 'Sales & Business Development', array['sales','business development','account executive','account manager','bdm','bde','inside sales','pre-sales','channel partner','telecaller','relationship manager'], 70),
  ('customer-support', 'Customer Support', array['customer support','customer service','customer success','support specialist','help desk','helpdesk','call center','bpo','technical support'], 80),
  ('content-writing', 'Content & Writing', array['content writer','copywriter','technical writer','editor','journalist','writer','translator'], 90),
  ('finance-accounting', 'Finance & Accounting', array['accountant','accounts','finance','chartered accountant','ca ','tally','gst','auditor','bookkeeper','financial analyst','payroll','tax'], 100),
  ('hr-recruiting', 'HR & Recruiting', array['hr ','human resources','recruiter','talent acquisition','hr executive','people operations','hrbp'], 110),
  ('operations-admin', 'Operations & Admin', array['operations','office administrator','admin executive','back office','data entry','logistics','supply chain','procurement','store manager','warehouse'], 120),
  ('textile-manufacturing', 'Textile & Manufacturing', array['textile','garment','weaving','embroidery','dyeing','fabric','merchandiser','production manager','plant manager','quality control','mechanical engineer','manufacturing','factory'], 130),
  ('diamond-jewellery', 'Diamond & Jewellery', array['diamond','jewellery','jewelry','gemologist','polishing','gem','ornament','cad jewellery'], 140),
  ('healthcare', 'Healthcare', array['nurse','doctor','pharmacist','medical','healthcare','clinical','physiotherapist','lab technician','hospital'], 150),
  ('education', 'Education & Training', array['teacher','tutor','faculty','trainer','lecturer','professor','education','counsellor','instructor'], 160),
  ('other', 'Other', array[]::text[], 999)
on conflict (slug) do update set name = excluded.name, keywords = excluded.keywords, sort_order = excluded.sort_order;

insert into jobradar.locations (slug, name, kind, state, aliases, sort_order) values
  ('remote', 'Remote', 'remote', null, array['remote','work from home','wfh','anywhere','worldwide'], 1),
  ('surat', 'Surat', 'city', 'Gujarat', array['surat'], 2),
  ('ahmedabad', 'Ahmedabad', 'city', 'Gujarat', array['ahmedabad','amdavad'], 3),
  ('vadodara', 'Vadodara', 'city', 'Gujarat', array['vadodara','baroda'], 4),
  ('rajkot', 'Rajkot', 'city', 'Gujarat', array['rajkot'], 5),
  ('gandhinagar', 'Gandhinagar', 'city', 'Gujarat', array['gandhinagar','gift city'], 6),
  ('mumbai', 'Mumbai', 'city', 'Maharashtra', array['mumbai','bombay','navi mumbai','thane'], 10),
  ('pune', 'Pune', 'city', 'Maharashtra', array['pune'], 11),
  ('bengaluru', 'Bengaluru', 'city', 'Karnataka', array['bengaluru','bangalore'], 12),
  ('delhi-ncr', 'Delhi NCR', 'city', 'Delhi', array['delhi','new delhi','ncr','gurgaon','gurugram','noida','ghaziabad','faridabad'], 13),
  ('hyderabad', 'Hyderabad', 'city', 'Telangana', array['hyderabad','secunderabad'], 14),
  ('chennai', 'Chennai', 'city', 'Tamil Nadu', array['chennai','madras'], 15),
  ('kolkata', 'Kolkata', 'city', 'West Bengal', array['kolkata','calcutta'], 16),
  ('jaipur', 'Jaipur', 'city', 'Rajasthan', array['jaipur'], 17),
  ('indore', 'Indore', 'city', 'Madhya Pradesh', array['indore'], 18),
  ('kochi', 'Kochi', 'city', 'Kerala', array['kochi','cochin'], 19),
  ('chandigarh', 'Chandigarh', 'city', 'Chandigarh', array['chandigarh','mohali'], 20)
on conflict (slug) do update set name = excluded.name, kind = excluded.kind, state = excluded.state, aliases = excluded.aliases;

-- Surat districts / areas
insert into jobradar.locations (slug, name, kind, state, parent_id, aliases, sort_order)
select v.slug, v.name, 'district', 'Gujarat', (select id from jobradar.locations where slug = 'surat'), v.aliases, v.ord
  from (values
    ('surat-adajan', 'Adajan', array['adajan'], 1),
    ('surat-vesu', 'Vesu', array['vesu'], 2),
    ('surat-varachha', 'Varachha', array['varachha','varachha road'], 3),
    ('surat-katargam', 'Katargam', array['katargam'], 4),
    ('surat-athwa', 'Athwa', array['athwa','athwalines','athwa lines'], 5),
    ('surat-udhna', 'Udhna', array['udhna'], 6),
    ('surat-piplod', 'Piplod', array['piplod'], 7),
    ('surat-pal', 'Pal', array['pal gam','pal surat'], 8),
    ('surat-sachin', 'Sachin GIDC', array['sachin','sachin gidc'], 9),
    ('surat-hazira', 'Hazira', array['hazira'], 10),
    ('surat-ring-road', 'Ring Road', array['ring road','textile market'], 11),
    ('surat-mota-varachha', 'Mota Varachha', array['mota varachha'], 12),
    ('surat-citylight', 'City Light', array['city light','citylight'], 13),
    ('surat-majura', 'Majura Gate', array['majura','majura gate'], 14)
  ) as v(slug, name, aliases, ord)
on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id, aliases = excluded.aliases;

insert into jobradar.skills (slug, name, aliases) values
  ('javascript', 'JavaScript', array['javascript','js','es6']),
  ('typescript', 'TypeScript', array['typescript']),
  ('react', 'React', array['react','reactjs','react.js']),
  ('nextjs', 'Next.js', array['next.js','nextjs']),
  ('nodejs', 'Node.js', array['node.js','nodejs','node']),
  ('python', 'Python', array['python','django','flask','fastapi']),
  ('java', 'Java', array['java','spring','spring boot']),
  ('php', 'PHP', array['php','laravel','wordpress']),
  ('golang', 'Go', array['golang']),
  ('sql', 'SQL', array['sql','mysql','postgresql','postgres']),
  ('aws', 'AWS', array['aws','amazon web services']),
  ('docker', 'Docker', array['docker']),
  ('kubernetes', 'Kubernetes', array['kubernetes','k8s']),
  ('flutter', 'Flutter', array['flutter','dart']),
  ('figma', 'Figma', array['figma']),
  ('seo', 'SEO', array['seo','search engine optimization']),
  ('google-ads', 'Google Ads', array['google ads','adwords','ppc']),
  ('meta-ads', 'Meta Ads', array['facebook ads','meta ads','instagram ads']),
  ('social-media', 'Social Media Marketing', array['social media','smm']),
  ('excel', 'Excel', array['excel','ms excel','advanced excel']),
  ('tally', 'Tally', array['tally','tally erp']),
  ('power-bi', 'Power BI', array['power bi','powerbi']),
  ('machine-learning', 'Machine Learning', array['machine learning','deep learning','ml']),
  ('photoshop', 'Photoshop', array['photoshop','illustrator','adobe']),
  ('communication', 'Communication', array['communication skills','english communication']),
  ('sales', 'Sales', array['b2b sales','b2c sales','lead generation'])
on conflict (slug) do update set name = excluded.name, aliases = excluded.aliases;

insert into jobradar.keyword_synonyms (term, synonyms) values
  ('digital marketing', array['online marketing','internet marketing','performance marketing','seo','social media marketing','google ads']),
  ('developer', array['engineer','programmer']),
  ('software engineer', array['software developer','programmer']),
  ('frontend', array['front end','front-end','ui developer','react developer']),
  ('backend', array['back end','back-end','server side']),
  ('full stack', array['fullstack','full-stack']),
  ('react', array['reactjs','react.js']),
  ('node', array['nodejs','node.js']),
  ('seo', array['search engine optimization','search engine optimisation']),
  ('accountant', array['accounts executive','accounting','tally']),
  ('hr', array['human resources','recruiter','talent acquisition']),
  ('designer', array['graphic designer','ui designer','ux designer']),
  ('data analyst', array['business analyst','analytics','power bi']),
  ('sales', array['business development','bde','bdm']),
  ('customer support', array['customer service','customer success','support executive']),
  ('remote', array['work from home','wfh']),
  ('diamond', array['diamond polishing','diamond assortment','gemologist']),
  ('textile', array['garment','fabric','merchandiser'])
on conflict (term) do update set synonyms = excluded.synonyms;

-- Sources. Each source's own terms and limits define min_interval_minutes and
-- max_requests_per_cycle. Sources awaiting credentials stay disabled.
insert into jobradar.sources (slug, name, source_type, homepage_url, terms_url, attribution, is_enabled,
  permission_status, permission_notes, min_interval_minutes, max_requests_per_cycle, max_retries,
  rate_limit_per_minute, timeout_ms, health_status) values
  ('arbeitnow', 'Arbeitnow', 'api', 'https://www.arbeitnow.com', 'https://www.arbeitnow.com/blog/job-board-api',
   'Jobs via Arbeitnow', true, 'permitted',
   'Free public job board API offered for third-party job boards. No API key. Polled at most every 30 minutes, max 2 pages per cycle.',
   30, 2, 3, 10, 15000, 'unknown'),
  ('remoteok', 'Remote OK', 'api', 'https://remoteok.com', 'https://remoteok.com/api',
   'Jobs via Remote OK', true, 'permitted',
   'Public JSON API. Terms require linking back to Remote OK and naming it as the source; JobRadar shows the attribution and original link on every job. Polled hourly with a single request (feed updates are not real-time).',
   60, 1, 3, 2, 15000, 'unknown'),
  ('remotive', 'Remotive', 'api', 'https://remotive.com', 'https://remotive.com/api/remote-jobs',
   'Jobs via Remotive', false, 'restricted',
   'Restricted by source terms: Remotive''s public API terms prohibit displaying its jobs in order to collect sign-ups/email addresses and ask for at most ~4 calls a day. JobRadar alerts collect email addresses, so this source stays disabled unless written permission (or their paid API) is obtained.',
   360, 1, 2, 1, 20000, 'disabled'),
  ('adzuna-in', 'Adzuna India', 'api', 'https://www.adzuna.in', 'https://developer.adzuna.com/docs/terms_of_service',
   'Jobs by Adzuna', false, 'awaiting_credentials',
   'Official API, requires ADZUNA_APP_ID / ADZUNA_APP_KEY. Free tier quota (~250 calls/day): 1 request per 30-minute cycle stays within it. Enable once credentials are configured.',
   30, 1, 3, 5, 15000, 'disabled')
on conflict (slug) do update set
  name = excluded.name, homepage_url = excluded.homepage_url, terms_url = excluded.terms_url,
  attribution = excluded.attribution, permission_notes = excluded.permission_notes,
  min_interval_minutes = excluded.min_interval_minutes, max_requests_per_cycle = excluded.max_requests_per_cycle,
  permission_status = case when jobradar.sources.permission_status = 'permitted' and excluded.permission_status <> 'permitted'
                           then excluded.permission_status else jobradar.sources.permission_status end;

insert into jobradar.collection_schedules (source_id, interval_minutes, is_enabled, next_run_at)
select s.id, greatest(30, s.min_interval_minutes), true, now()
  from jobradar.sources s
on conflict (source_id) do nothing;

insert into jobradar.settings (key, value) values
  ('automation', '{"paused": false}'),
  ('notifications', '{"email_enabled": true, "push_enabled": true, "whatsapp_enabled": false, "max_alerts_per_email": 5, "daily_digest_hour_ist": 8}'),
  ('email_templates', '{"subject_single": "New {category} job discovered{in_city}", "subject_multi": "{count} new jobs matching your JobRadar alert", "intro": "JobRadar found new jobs that match your alert.", "footer": "You are receiving this because you subscribed to JobRadar job alerts."}')
on conflict (key) do nothing;
