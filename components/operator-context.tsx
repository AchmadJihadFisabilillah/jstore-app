"use client";
import { createContext, useContext } from "react";
import type { Viewer } from "@/lib/inventory";
export const OperatorContext=createContext<Viewer>({id:"",name:"Admin",role:"admin"});
export const useOperator=()=>useContext(OperatorContext);
