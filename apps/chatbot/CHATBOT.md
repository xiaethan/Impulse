Chatbot w/ RAG based retrieval for users to get summary insights onto their rowing. 

Stuff we can do: 
Session Analysis + Summary
Technique analysis
coach oriented questions
historical recall


Chat UI -> LLM + query router ->
1. SQL-powered Chat -> 
2. RAG retrival 
to get Grounded answer in historical data



Base LLM (Qwen hosted on Razer Blade) -> 
1. RAG retrival 
1. Vector retrival
2. Context assembly + analytics
3. Generated Answer

Razer needs to have cloudflare tunneling or tailscale to protect privacy. 