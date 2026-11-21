-- Weekly digest frequency for saved-search alerts, plus related-title synonyms
-- used by search and recommendations.
alter table jobradar.alert_preferences drop constraint if exists alert_preferences_notification_frequency_check;
alter table jobradar.alert_preferences add constraint alert_preferences_notification_frequency_check
  check (notification_frequency in ('instant', 'every_30_minutes', 'daily', 'weekly'));

insert into jobradar.keyword_synonyms (term, synonyms) values
  ('performance marketing', array['digital marketing','ppc','sem','google ads','paid marketing']),
  ('ppc', array['pay per click','google ads','sem','paid search','performance marketing']),
  ('sem', array['search engine marketing','ppc','google ads','paid search']),
  ('google ads', array['adwords','ppc','sem','performance marketing']),
  ('social media', array['social media marketing','smm','social media executive']),
  ('data analyst', array['data analytics','business analyst','mis executive']),
  ('sales', array['business development','bde','inside sales']),
  ('customer support', array['customer service','customer care','bpo','call centre'])
on conflict (term) do nothing;
