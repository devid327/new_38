import mongoose from "mongoose";

const AddrSchema = new mongoose.Schema({
	val: { type: String, required: true },
});

const Addr = mongoose.model("Addr", AddrSchema);

export default Addr;
