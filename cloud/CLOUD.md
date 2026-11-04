AWS RDS for database. Or we can use Aurora PostgreSQL but it is more expensive. 

Razer Blade 14 will host AI model for chatbot. 3070 has 8 GB VRAM. Will expose ports to query the database. 


Don't expose Ollama's port 11434 directly to the public internet. Put it behind authenticated access, preferably a private VPN or secure tunnel, and only allow your backend to communicate with it.