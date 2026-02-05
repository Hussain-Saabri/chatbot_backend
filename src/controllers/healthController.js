export const healthCheck = async (req, res) => {
    
    try {
        console.log("Health check request received");
        res.status(200).json({ message: "Server is running" });
    } catch (error) {
        console.error("Health check error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};