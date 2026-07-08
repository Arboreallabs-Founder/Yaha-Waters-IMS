export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bom_lines: {
        Row: {
          bom_id: string
          component_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          project_line_item_id: string | null
          required_qty: number
          source: Database["public"]["Enums"]["bom_line_source"]
          updated_at: string | null
        }
        Insert: {
          bom_id: string
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_line_item_id?: string | null
          required_qty?: number
          source?: Database["public"]["Enums"]["bom_line_source"]
          updated_at?: string | null
        }
        Update: {
          bom_id?: string
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_line_item_id?: string | null
          required_qty?: number
          source?: Database["public"]["Enums"]["bom_line_source"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "bom_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "bom_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_project_line_item_id_fkey"
            columns: ["project_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_template_lines: {
        Row: {
          bom_template_id: string
          component_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_common: boolean
          is_variant_driven: boolean
          note: string | null
          quantity: number
          updated_at: string | null
          variant_rule: Json | null
        }
        Insert: {
          bom_template_id: string
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_common?: boolean
          is_variant_driven?: boolean
          note?: string | null
          quantity?: number
          updated_at?: string | null
          variant_rule?: Json | null
        }
        Update: {
          bom_template_id?: string
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_common?: boolean
          is_variant_driven?: boolean
          note?: string | null
          quantity?: number
          updated_at?: string | null
          variant_rule?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_template_lines_bom_template_id_fkey"
            columns: ["bom_template_id"]
            isOneToOne: false
            referencedRelation: "bom_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_template_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_template_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "bom_template_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "bom_template_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_template_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          product_id: string
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      boms: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          status: Database["public"]["Enums"]["bom_status"]
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["bom_status"]
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["bom_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boms_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          component_no: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_serialized: boolean
          name: string
          reorder_level: number | null
          standard_cost: number | null
          type: string | null
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          component_no: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_serialized?: boolean
          name: string
          reorder_level?: number | null
          standard_cost?: number | null
          type?: string | null
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          component_no?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_serialized?: boolean
          name?: string
          reorder_level?: number | null
          standard_cost?: number | null
          type?: string | null
          uom?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          contact: string | null
          created_at: string
          created_by: string | null
          gst_no: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          gst_no?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          gst_no?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finished_goods: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string | null
          project_line_item_id: string | null
          serial_no: string
          status: Database["public"]["Enums"]["fg_status"]
          updated_at: string | null
          variant_selections: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          project_line_item_id?: string | null
          serial_no: string
          status?: Database["public"]["Enums"]["fg_status"]
          updated_at?: string | null
          variant_selections?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          project_line_item_id?: string | null
          serial_no?: string
          status?: Database["public"]["Enums"]["fg_status"]
          updated_at?: string | null
          variant_selections?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "finished_goods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_goods_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_goods_project_line_item_id_fkey"
            columns: ["project_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_lines: {
        Row: {
          component_id: string | null
          created_at: string
          created_by: string | null
          grn_id: string
          id: string
          is_untagged: boolean
          po_line_id: string | null
          project_id: string | null
          qty_received: number
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          grn_id: string
          id?: string
          is_untagged?: boolean
          po_line_id?: string | null
          project_id?: string | null
          qty_received?: number
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          grn_id?: string
          id?: string
          is_untagged?: boolean
          po_line_id?: string | null
          project_id?: string | null
          qty_received?: number
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "v_po_lines_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "v_po_overdue"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "grn_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      grns: {
        Row: {
          challan_no: string | null
          created_at: string
          created_by: string | null
          grn_no: string
          id: string
          po_id: string | null
          received_at: string
          received_by: string | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          grn_no: string
          id?: string
          po_id?: string | null
          received_at?: string
          received_by?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          grn_no?: string
          id?: string
          po_id?: string | null
          received_at?: string
          received_by?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_vs_po"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "grns_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_orders_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "grns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          component_id: string | null
          created_at: string
          created_by: string | null
          grn_line_id: string | null
          id: string
          is_serialized: boolean
          location: string | null
          lot_code: string
          project_id: string | null
          qty_initial: number
          qty_on_hand: number
          status: Database["public"]["Enums"]["lot_status"]
          unit_cost: number | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          grn_line_id?: string | null
          id?: string
          is_serialized?: boolean
          location?: string | null
          lot_code: string
          project_id?: string | null
          qty_initial?: number
          qty_on_hand?: number
          status?: Database["public"]["Enums"]["lot_status"]
          unit_cost?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          grn_line_id?: string | null
          id?: string
          is_serialized?: boolean
          location?: string | null
          lot_code?: string
          project_id?: string | null
          qty_initial?: number
          qty_on_hand?: number
          status?: Database["public"]["Enums"]["lot_status"]
          unit_cost?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "grn_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "v_grn_lines_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "v_untagged_receipts"
            referencedColumns: ["grn_line_id"]
          },
          {
            foreignKeyName: "inventory_lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "inventory_lots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      po_lines: {
        Row: {
          amount: number | null
          component_id: string | null
          created_at: string
          created_by: string | null
          expected_date: string | null
          id: string
          line_status: Database["public"]["Enums"]["po_line_status"]
          po_id: string
          project_id: string | null
          qty_ordered: number
          qty_received: number
          rate: number | null
          requisition_line_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          line_status?: Database["public"]["Enums"]["po_line_status"]
          po_id: string
          project_id?: string | null
          qty_ordered?: number
          qty_received?: number
          rate?: number | null
          requisition_line_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          line_status?: Database["public"]["Enums"]["po_line_status"]
          po_id?: string
          project_id?: string | null
          qty_ordered?: number
          qty_received?: number
          rate?: number | null
          requisition_line_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_vs_po"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_orders_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_requisition_line_id_fkey"
            columns: ["requisition_line_id"]
            isOneToOne: false
            referencedRelation: "requisition_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_params: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          input_type: Database["public"]["Enums"]["input_type"]
          max_value: number | null
          min_value: number | null
          name: string
          options: Json | null
          product_id: string
          sort_order: number
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_type?: Database["public"]["Enums"]["input_type"]
          max_value?: number | null
          min_value?: number | null
          name: string
          options?: Json | null
          product_id: string
          sort_order?: number
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_type?: Database["public"]["Enums"]["input_type"]
          max_value?: number | null
          min_value?: number | null
          name?: string
          options?: Json | null
          product_id?: string
          sort_order?: number
          uom?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_params_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_params_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_image: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_serialized: boolean
          model_name: string
          sku_code: string
          updated_at: string | null
        }
        Insert: {
          base_image?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_serialized?: boolean
          model_name: string
          sku_code: string
          updated_at?: string | null
        }
        Update: {
          base_image?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_serialized?: boolean
          model_name?: string
          sku_code?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["role"]
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["role"]
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["role"]
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activities: {
        Row: {
          activity: string
          actual_date: string | null
          corrective_action: string | null
          created_at: string
          created_by: string | null
          delay_reason: string | null
          id: string
          material_available: boolean | null
          planned_date: string | null
          po_released: boolean | null
          project_id: string
          responsibility: string | null
          sort_order: number
          status: string | null
          updated_at: string | null
          variance_days: number | null
        }
        Insert: {
          activity: string
          actual_date?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          delay_reason?: string | null
          id?: string
          material_available?: boolean | null
          planned_date?: string | null
          po_released?: boolean | null
          project_id: string
          responsibility?: string | null
          sort_order?: number
          status?: string | null
          updated_at?: string | null
          variance_days?: number | null
        }
        Update: {
          activity?: string
          actual_date?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          delay_reason?: string | null
          id?: string
          material_available?: boolean | null
          planned_date?: string | null
          po_released?: boolean | null
          project_id?: string
          responsibility?: string | null
          sort_order?: number
          status?: string | null
          updated_at?: string | null
          variance_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_path: string | null
          id: string
          project_id: string
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_path?: string | null
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_path?: string | null
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      project_line_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string | null
          project_id: string
          quantity: number
          updated_at: string | null
          variant_selections: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          project_id: string
          quantity?: number
          updated_at?: string | null
          variant_selections?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string | null
          project_id?: string
          quantity?: number
          updated_at?: string | null
          variant_selections?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_line_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_po_number: string | null
          customer_po_value: number | null
          delivery_date: string | null
          dispatch_date: string | null
          id: string
          order_date: string | null
          project_no: string
          status: Database["public"]["Enums"]["project_status"]
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_po_number?: string | null
          customer_po_value?: number | null
          delivery_date?: string | null
          dispatch_date?: string | null
          id?: string
          order_date?: string | null
          project_no: string
          status?: Database["public"]["Enums"]["project_status"]
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_po_number?: string | null
          customer_po_value?: number | null
          delivery_date?: string | null
          dispatch_date?: string | null
          id?: string
          order_date?: string | null
          project_no?: string
          status?: Database["public"]["Enums"]["project_status"]
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_no: string | null
          invoice_status: string | null
          is_informal: boolean
          po_date: string | null
          po_no: string
          source: Database["public"]["Enums"]["po_source"]
          status: Database["public"]["Enums"]["po_status"]
          total_amount: number | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          invoice_status?: string | null
          is_informal?: boolean
          po_date?: string | null
          po_no: string
          source?: Database["public"]["Enums"]["po_source"]
          status?: Database["public"]["Enums"]["po_status"]
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          invoice_status?: string | null
          is_informal?: boolean
          po_date?: string | null
          po_no?: string
          source?: Database["public"]["Enums"]["po_source"]
          status?: Database["public"]["Enums"]["po_status"]
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_lines: {
        Row: {
          bom_line_id: string | null
          component_id: string | null
          created_at: string
          created_by: string | null
          id: string
          qty: number
          requisition_id: string
          shortfall_qty: number | null
          updated_at: string | null
        }
        Insert: {
          bom_line_id?: string | null
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          qty?: number
          requisition_id: string
          shortfall_qty?: number | null
          updated_at?: string | null
        }
        Update: {
          bom_line_id?: string | null
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          qty?: number
          requisition_id?: string
          shortfall_qty?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisition_lines_bom_line_id_fkey"
            columns: ["bom_line_id"]
            isOneToOne: false
            referencedRelation: "bom_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "requisition_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "requisition_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_lines_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string | null
          req_no: string
          requested_by: string | null
          status: Database["public"]["Enums"]["req_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string | null
          req_no: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["req_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string | null
          req_no?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["req_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          component_id: string | null
          created_at: string
          created_by: string | null
          id: string
          lot_id: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          performed_at: string
          performed_by: string | null
          project_id: string | null
          qty: number
          reference_id: string | null
          reference_type: string | null
          updated_at: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot_id?: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          performed_at?: string
          performed_by?: string | null
          project_id?: string | null
          qty: number
          reference_id?: string | null
          reference_type?: string | null
          updated_at?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot_id?: string | null
          movement_type?: Database["public"]["Enums"]["movement_type"]
          performed_at?: string
          performed_by?: string | null
          project_id?: string | null
          qty?: number
          reference_id?: string | null
          reference_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_inventory_lots_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_stale_stock"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "stock_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_components: {
        Row: {
          component_id: string
          created_at: string
          created_by: string | null
          id: string
          lead_time_days: number | null
          price: number | null
          updated_at: string | null
          vendor_id: string
          vendor_part_code: string | null
        }
        Insert: {
          component_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_time_days?: number | null
          price?: number | null
          updated_at?: string | null
          vendor_id: string
          vendor_part_code?: string | null
        }
        Update: {
          component_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_time_days?: number | null
          price?: number | null
          updated_at?: string | null
          vendor_id?: string
          vendor_part_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_components_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_components_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          avg_lead_time_days: number | null
          contact: string | null
          created_at: string
          created_by: string | null
          gst_no: string | null
          id: string
          is_active: boolean
          name: string
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          avg_lead_time_days?: number | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          name: string
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          avg_lead_time_days?: number | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_bom_variance: {
        Row: {
          component_id: string | null
          order_gap: number | null
          ordered_qty: number | null
          project_id: string | null
          receive_gap: number | null
          received_qty: number | null
          required_qty: number | null
        }
        Relationships: []
      }
      v_component_on_hand: {
        Row: {
          component_id: string | null
          component_no: string | null
          lot_count: number | null
          name: string | null
          qty_on_hand: number | null
          stock_value: number | null
          uom: string | null
        }
        Relationships: []
      }
      v_component_on_hand_safe: {
        Row: {
          component_id: string | null
          component_no: string | null
          lot_count: number | null
          name: string | null
          qty_on_hand: number | null
          uom: string | null
        }
        Relationships: []
      }
      v_components_safe: {
        Row: {
          component_no: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          is_serialized: boolean | null
          name: string | null
          reorder_level: number | null
          type: string | null
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          component_no?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          is_serialized?: boolean | null
          name?: string | null
          reorder_level?: number | null
          type?: string | null
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          component_no?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          is_serialized?: boolean | null
          name?: string | null
          reorder_level?: number | null
          type?: string | null
          uom?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_grn_lines_safe: {
        Row: {
          component_id: string | null
          created_at: string | null
          created_by: string | null
          grn_id: string | null
          id: string | null
          is_untagged: boolean | null
          po_line_id: string | null
          project_id: string | null
          qty_received: number | null
          updated_at: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_id?: string | null
          id?: string | null
          is_untagged?: boolean | null
          po_line_id?: string | null
          project_id?: string | null
          qty_received?: number | null
          updated_at?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_id?: string | null
          id?: string | null
          is_untagged?: boolean | null
          po_line_id?: string | null
          project_id?: string | null
          qty_received?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "v_po_lines_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "v_po_overdue"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "grn_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inventory_lots_safe: {
        Row: {
          component_id: string | null
          created_at: string | null
          created_by: string | null
          grn_line_id: string | null
          id: string | null
          is_serialized: boolean | null
          location: string | null
          lot_code: string | null
          project_id: string | null
          qty_initial: number | null
          qty_on_hand: number | null
          status: Database["public"]["Enums"]["lot_status"] | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_line_id?: string | null
          id?: string | null
          is_serialized?: boolean | null
          location?: string | null
          lot_code?: string | null
          project_id?: string | null
          qty_initial?: number | null
          qty_on_hand?: number | null
          status?: Database["public"]["Enums"]["lot_status"] | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_line_id?: string | null
          id?: string | null
          is_serialized?: boolean | null
          location?: string | null
          lot_code?: string | null
          project_id?: string | null
          qty_initial?: number | null
          qty_on_hand?: number | null
          status?: Database["public"]["Enums"]["lot_status"] | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "grn_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "v_grn_lines_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "v_untagged_receipts"
            referencedColumns: ["grn_line_id"]
          },
          {
            foreignKeyName: "inventory_lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "inventory_lots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_vs_po: {
        Row: {
          amount_diff: number | null
          invoice_no: string | null
          invoice_status: string | null
          lines_amount: number | null
          po_id: string | null
          po_no: string | null
          total_amount: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_missing_po: {
        Row: {
          component_id: string | null
          component_name: string | null
          component_no: string | null
          order_gap: number | null
          ordered_qty: number | null
          project_id: string | null
          received_qty: number | null
          required_qty: number | null
        }
        Relationships: []
      }
      v_po_lines_safe: {
        Row: {
          component_id: string | null
          created_at: string | null
          created_by: string | null
          expected_date: string | null
          id: string | null
          line_status: Database["public"]["Enums"]["po_line_status"] | null
          po_id: string | null
          project_id: string | null
          qty_ordered: number | null
          qty_received: number | null
          requisition_line_id: string | null
          updated_at: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_date?: string | null
          id?: string | null
          line_status?: Database["public"]["Enums"]["po_line_status"] | null
          po_id?: string | null
          project_id?: string | null
          qty_ordered?: number | null
          qty_received?: number | null
          requisition_line_id?: string | null
          updated_at?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_date?: string | null
          id?: string | null
          line_status?: Database["public"]["Enums"]["po_line_status"] | null
          po_id?: string | null
          project_id?: string | null
          qty_ordered?: number | null
          qty_received?: number | null
          requisition_line_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_vs_po"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_orders_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_requisition_line_id_fkey"
            columns: ["requisition_line_id"]
            isOneToOne: false
            referencedRelation: "requisition_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      v_po_overdue: {
        Row: {
          component_id: string | null
          component_name: string | null
          component_no: string | null
          days_overdue: number | null
          expected_date: string | null
          po_id: string | null
          po_line_id: string | null
          po_no: string | null
          qty_ordered: number | null
          qty_received: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "po_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_vs_po"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_orders_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_project_consumption: {
        Row: {
          component_id: string | null
          consumed_qty: number | null
          consumption_value: number | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "stock_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_projects_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      v_projects_safe: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_po_number: string | null
          delivery_date: string | null
          dispatch_date: string | null
          id: string | null
          order_date: string | null
          project_no: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_po_number?: string | null
          delivery_date?: string | null
          dispatch_date?: string | null
          id?: string | null
          order_date?: string | null
          project_no?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_po_number?: string | null
          delivery_date?: string | null
          dispatch_date?: string | null
          id?: string | null
          order_date?: string | null
          project_no?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      v_purchase_orders_safe: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          invoice_no: string | null
          invoice_status: string | null
          is_informal: boolean | null
          po_date: string | null
          po_no: string | null
          source: Database["public"]["Enums"]["po_source"] | null
          status: Database["public"]["Enums"]["po_status"] | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          invoice_no?: string | null
          invoice_status?: string | null
          is_informal?: boolean | null
          po_date?: string | null
          po_no?: string | null
          source?: Database["public"]["Enums"]["po_source"] | null
          status?: Database["public"]["Enums"]["po_status"] | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          invoice_no?: string | null
          invoice_status?: string | null
          is_informal?: boolean | null
          po_date?: string | null
          po_no?: string | null
          source?: Database["public"]["Enums"]["po_source"] | null
          status?: Database["public"]["Enums"]["po_status"] | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stale_stock: {
        Row: {
          age_days: number | null
          component_id: string | null
          component_name: string | null
          component_no: string | null
          created_at: string | null
          lot_code: string | null
          lot_id: string | null
          qty_on_hand: number | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      v_supplier_kpi: {
        Row: {
          avg_lead_time_days: number | null
          completed_pos: number | null
          name: string | null
          open_pos: number | null
          rating: number | null
          received_lines: number | null
          total_lines: number | null
          total_pos: number | null
          vendor_id: string | null
        }
        Relationships: []
      }
      v_untagged_receipts: {
        Row: {
          challan_no: string | null
          component_id: string | null
          component_name: string | null
          component_no: string | null
          grn_id: string | null
          grn_line_id: string | null
          grn_no: string | null
          qty_received: number | null
          received_at: string | null
          unit_cost: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "grn_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "grns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_vendor_components_safe: {
        Row: {
          component_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          lead_time_days: number | null
          updated_at: string | null
          vendor_id: string | null
          vendor_part_code: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          lead_time_days?: number | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_part_code?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          lead_time_days?: number | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_part_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_component_on_hand_safe"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "vendor_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "v_components_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_components_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpi"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_components_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_can_access_project: { Args: { p: string }; Returns: boolean }
      auth_is_staff: { Args: never; Returns: boolean }
      auth_role: { Args: never; Returns: Database["public"]["Enums"]["role"] }
      auth_team_id: { Args: never; Returns: string }
      fiscal_year_label: { Args: { d?: string }; Returns: string }
      next_grn_no: { Args: never; Returns: string }
      next_po_no: { Args: never; Returns: string }
      next_req_no: { Args: never; Returns: string }
      recompute_po_status: { Args: { p_po: string }; Returns: undefined }
    }
    Enums: {
      bom_line_source: "template" | "manual"
      bom_status: "draft" | "approved"
      doc_status: "pending" | "approved" | "rejected"
      doc_type: "qap" | "drawing" | "spec" | "other"
      fg_status: "in_production" | "ready" | "dispatched"
      input_type: "dropdown" | "number" | "text"
      lot_status: "available" | "reserved" | "consumed"
      movement_type: "receipt" | "issue" | "adjustment" | "transfer" | "return"
      po_line_status: "pending" | "partial" | "received" | "cancelled"
      po_source: "system" | "phone"
      po_status: "draft" | "sent" | "partial" | "completed" | "cancelled"
      project_status:
        | "planning"
        | "doc_approval"
        | "procurement"
        | "production"
        | "dispatched"
        | "closed"
        | "on_hold"
      req_status: "open" | "partially_ordered" | "ordered" | "closed"
      role: "admin" | "founder" | "team_lead" | "team_member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      bom_line_source: ["template", "manual"],
      bom_status: ["draft", "approved"],
      doc_status: ["pending", "approved", "rejected"],
      doc_type: ["qap", "drawing", "spec", "other"],
      fg_status: ["in_production", "ready", "dispatched"],
      input_type: ["dropdown", "number", "text"],
      lot_status: ["available", "reserved", "consumed"],
      movement_type: ["receipt", "issue", "adjustment", "transfer", "return"],
      po_line_status: ["pending", "partial", "received", "cancelled"],
      po_source: ["system", "phone"],
      po_status: ["draft", "sent", "partial", "completed", "cancelled"],
      project_status: [
        "planning",
        "doc_approval",
        "procurement",
        "production",
        "dispatched",
        "closed",
        "on_hold",
      ],
      req_status: ["open", "partially_ordered", "ordered", "closed"],
      role: ["admin", "founder", "team_lead", "team_member"],
    },
  },
} as const
