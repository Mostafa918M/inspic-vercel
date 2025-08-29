const mongoose = require("mongoose");

pinSchema = new mongoose.Schema({
    title:{type:String , required:true},
    description:{type:String , required:true},
    link:{type:String , default:null},
    privacy:{type:String, enum:["public", "private"], default:"public"},
    media:{
        uri:{type:String, required:true},
        URL:{type:String, default:""},
        filename:{type:String, required:true},
        type:{type:String, enum:["image", "video"]},
        thumbnail:{type:String, default:null},
    },
    publisher:{type:mongoose.Schema.Types.ObjectId, ref:"User", required:true},
    likers:[{type:mongoose.Schema.Types.ObjectId, ref:"User"}],
    bookmarkedBy:[{type:mongoose.Schema.Types.ObjectId, ref:"User"}],
    viewers:[{type:mongoose.Schema.Types.ObjectId, ref:"User"}],
    comments:[{type:mongoose.Schema.Types.ObjectId, ref:"Comment"}],
    keywords:{type:[String], default:[]},
    downloadCount:{type:Number, default:0},
    pinReportCount:{type:Number, default:0},
    
    
},{timestamps:true});
pinSchema.virtual('likeCount').get(function () {
  return Array.isArray(this.likers) ? this.likers.length : 0;
});

module.exports = mongoose.model("Pin", pinSchema);