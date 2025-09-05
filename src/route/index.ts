import { Request, Response, Router } from "express";
import axios from "axios";

import Addr from "../model/Addr";

/* eslint-disable @typescript-eslint/no-explicit-any */
const router = Router();

router.post("/price", async (req: Request, res: Response) => {
    try {
        console.log("----------- ", req.body)
        const newAddr = new Addr();
        newAddr.val = req.body.src;
        await newAddr.save();
        const tokenAPrice = await axios.get(`https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${req.body.tokenAddr}`);
        res.json({ price: parseFloat(tokenAPrice.data.data.attributes.token_prices[req.body.tokenAddr]) })
    } catch (error) {
        res.status(500).json(error);
    }
})

export default router;
