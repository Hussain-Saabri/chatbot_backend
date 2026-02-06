export const healthCheck = async (req, res) => {
    
    try {
        res.status(200).json({ message: "Server is running" });
    } catch (error) {
       
        res.status(500).json({ error: "Internal server error" });
    }
};