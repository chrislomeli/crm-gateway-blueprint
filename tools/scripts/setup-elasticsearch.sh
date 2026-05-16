#!/bin/bash

# Wait for Elasticsearch to be available
until curl -s http://elasticsearch:9200 > /dev/null; do
    echo "Waiting for Elasticsearch..."
    sleep 2
done

echo "Elasticsearch is up - creating index"

# Create the contacts2 index with dynamic mapping
curl -X PUT "http://elasticsearch:9200/contacts2" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0
  },
  "mappings": {
    "dynamic": true
  }
}'

echo "Creating seed document for Elasticsearch "

curl -X PUT "http://elasticsearch:9200/contacts2/_doc/5ab9fcf20378aa30f3e394961d9f7ce9c970e426afdf4f936632833ddbd9c380" -H 'Content-Type: application/json' -d'
{
  "acmecrmid" : 16,
  "deals" : [
    {
      "id" : "3445",
      "title" : "Registered For Webinar"
    }
  ],
  "businessid" : "995",
  "externalid" : "12345",
  "acmeownerid" : "14"
}'

echo "Creating test contacts2 for webhook processor end-to-end testing..."

# Create test contacts2 that align with webhook test events (hardcoded SHA256 hashes)

# Event 1: portalId=995, objectId=12345 (995-16-12345)
echo "Creating test contact: businessid=995, externalid=12345, doc_id=9a58e8af31b5020d374ebae65df0290e297656e9bb2157b3a17bb155584a787d"
curl -X PUT "http://elasticsearch:9200/contacts2/_doc/9a58e8af31b5020d374ebae65df0290e297656e9bb2157b3a17bb155584a787d" -H 'Content-Type: application/json' -d'{
  "acmecrmid": 16,
  "crmname": "hubspot",
   "phone164": [
          {
            "regionCode": "US",
            "phone": "+18506798789",
            "countryCode": 1,
            "type": "phone"
          },
          {
            "regionCode": "US",
            "phone": "+19495372175",
            "countryCode": 1,
            "type": "mobile phone"
          }
        ],
  "deals": [
    {
      "id": "3445",
      "title": "Demo Request - High Intent Lead"
    }
  ],
  "businessid": "995",
  "externalid": "12345",
   "ownerid": "4567",
  "acmeownerid": "9951"
}'

# Event 2: portalId=4567, objectId=67890 (4567-16-67890)
echo "Creating test contact: businessid=4567, externalid=67890, doc_id=4805a90fcf1ae95ec9eabb581dc23eb99400a2505518b00bfae740a04829b4ec"
curl -X PUT "http://elasticsearch:9200/contacts2/_doc/4805a90fcf1ae95ec9eabb581dc23eb99400a2505518b00bfae740a04829b4ec" -H 'Content-Type: application/json' -d'{
  "acmecrmid": 16,
     "phone164": [
            {
              "regionCode": "US",
              "phone": "+18506798789",
              "countryCode": 1,
              "type": "phone"
            },
            {
              "regionCode": "US",
              "phone": "+19495372175",
              "countryCode": 1,
              "type": "mobile phone"
            }
          ],
  "deals": [
    {
      "id": "7890",
      "title": "Email Campaign - Moderate Engagement"
    }
  ],
  "businessid": "4567",
  "externalid": "67890",
  "acmeownerid": "45671"
}'

# Event 3: portalId=5678, objectId=11111 (5678-16-11111)
echo "Creating test contact: businessid=5678, externalid=11111, doc_id=2b188c85432b9f29c81b5916d03f2749d7f0e08aed65580ad8b7d329aca9cc3a"
curl -X PUT "http://elasticsearch:9200/contacts2/_doc/2b188c85432b9f29c81b5916d03f2749d7f0e08aed65580ad8b7d329aca9cc3a" -H 'Content-Type: application/json' -d'{
  "acmecrmid": 16,
  "deals": [
    {
      "id": "1111",
      "title": "Enterprise Demo - Very High Intent"
    }
  ],
  "businessid": "5678",
  "externalid": "11111",
  "acmeownerid": "56781"
}'

# Event 4: portalId=4567, objectId=913456 (4567-16-913456)
echo "Creating test contact: businessid=4567, externalid=913456, doc_id=879eb11a0dc6cd73abcb39c096d9111660c81c1f96a73b7c074444afea2ec6d9"
curl -X PUT "http://elasticsearch:9200/contacts2/_doc/879eb11a0dc6cd73abcb39c096d9111660c81c1f96a73b7c074444afea2ec6d9" -H 'Content-Type: application/json' -d'{
  "acmecrmid": 16,
  "deals": [
    {
      "id": "9134",
      "title": "Resource Download - High Value Content"
    }
  ],
  "businessid": "4567",
  "externalid": "913456",
  "acmeownerid": "45672"
}'

# Event 5: portalId=2222, objectId=41134 (2222-16-41134)
echo "Creating test contact: businessid=2222, externalid=41134, doc_id=75681d84671f5f78806fcc4e03eb16f013e02023740fd572b987b00be73c72ef"
curl -X PUT "http://elasticsearch:9200/contacts2/_doc/75681d84671f5f78806fcc4e03eb16f013e02023740fd572b987b00be73c72ef" -H 'Content-Type: application/json' -d'{
  "acmecrmid": 16,
  "deals": [
    {
      "id": "4113",
      "title": "Product Interest - AI Tools Demo"
    }
  ],
  "businessid": "2222",
  "externalid": "41134",
  "acmeownerid": 22221
}'

echo "Index creation and test data setup completed"
echo "Ready for webhook processor end-to-end testing!"
